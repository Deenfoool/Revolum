// Resilient local photo decode for Revolum's standard (non-360) SfM sessions.
// Splat.js's default loader swallows individual image errors; report the
// offending source and use HTMLImageElement when createImageBitmap aborts.
// Decode BEFORE acquiring WebGPU to avoid competing peak memory allocations.
import {processSource} from '../vendor/splatjs/src/io/frames.js';
import {readExifFocal} from '../vendor/splatjs/src/io/exif.js';

const cancelled=signal=>{if(signal?.aborted)throw Error('Реконструкция отменена')};
function resizedDimensions(width,height,cap){
 const scale=Math.min(1,cap/Math.max(width,height));
 return [Math.max(2,Math.round(width*scale)),Math.max(2,Math.round(height*scale))];
}
async function htmlImage(file,{signal}={}){
 cancelled(signal);
 const url=URL.createObjectURL(file),img=new Image();
 let released=false;const cleanup=()=>{if(released)return;released=true;img.src='';URL.revokeObjectURL(url)};
 try{
  await new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error)=>{
    if(settled)return;settled=true;
    img.onload=null;img.onerror=null;signal?.removeEventListener?.('abort',abort);
    error?reject(error):resolve();
   };
   const abort=()=>{img.src='';finish(Error('Реконструкция отменена'))};
   img.onload=()=>finish(null);
   img.onerror=()=>finish(Error('HTML-декодер не смог открыть изображение'));
   signal?.addEventListener?.('abort',abort,{once:true});
   if(signal?.aborted){abort();return}
   img.src=url;
  });
  cancelled(signal);
  if(img.naturalWidth<2||img.naturalHeight<2)throw Error('Пустой кадр после HTML-декодирования');
  return {image:img,release:cleanup};
 }catch(error){cleanup();throw error}
}
async function decodeDrawable(file,meta,{maxDim,signal}){
 const cap=Math.max(128,Math.min(4096,Math.round(maxDim)));
 const nativeW=meta?.width||0,nativeH=meta?.height||0;
 const attempts=[];
 if(typeof createImageBitmap==='function'){
  if(nativeW>=64&&nativeH>=64&&Math.max(nativeW,nativeH)>cap*1.1){
   const [rw,rh]=resizedDimensions(nativeW,nativeH,cap);
   // resizeWidth + resizeHeight avoids encoder-specific aspect heuristics.
   try{
    cancelled(signal);
    const bitmap=await createImageBitmap(file,{imageOrientation:'from-image',resizeWidth:rw,resizeHeight:rh,resizeQuality:'high'});
    if(signal?.aborted){bitmap.close();cancelled(signal)}return {source:bitmap,width:bitmap.width,height:bitmap.height,method:'bitmap-resized',release:()=>bitmap.close()};
   }catch(error){cancelled(signal);attempts.push('bitmap-resized: '+(error?.message||error))}
  }
  try{
   cancelled(signal);
   const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
   if(signal?.aborted){bitmap.close();cancelled(signal)}
   // Don't let a native-size bitmap stand as the final working framebuffer.
   return {source:bitmap,width:bitmap.width,height:bitmap.height,method:'bitmap-native',release:()=>bitmap.close()};
  }catch(error){cancelled(signal);attempts.push('bitmap-native: '+(error?.message||error))}
 }
 try{
  const {image,release}=await htmlImage(file,{signal});
  const width=image.naturalWidth,height=image.naturalHeight;
  const [w,h]=resizedDimensions(width,height,cap);
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx){release();throw Error('Canvas2D не поддерживается')}
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  try{ctx.drawImage(image,0,0,w,h)}
  finally{release()}
  cancelled(signal);
  return {source:canvas,width:w,height:h,method:'html-canvas',release:()=>{canvas.width=0;canvas.height=0},previous:attempts};
 }catch(error){
  cancelled(signal);
  const reason=String(error?.message||error);
  throw Error('Все способы декодирования не сработали ('+[...attempts,'html-canvas: '+reason].join(' | ')+')');
 }
}
export async function decodeCapturePhotos(files,{photoMeta=[],trainMaxDim=640,featMaxDim=480,signal,onProgress=()=>{}}={}){
 if(!Array.isArray(files)||!files.length)throw Error('Нет фотографий для декодирования');
 const frames=[],failures=[],fallbacks=[];
 const cap=2*Math.max(trainMaxDim,featMaxDim);
 for(let i=0;i<files.length;i++){
  cancelled(signal);
  const file=files[i],meta=photoMeta[i]||null;
  onProgress({stage:'decode',done:i,total:files.length,message:'Декодирование '+(i+1)+'/'+files.length+': '+file.name});
  let drawable=null;
  try{
   drawable=await decodeDrawable(file,meta,{maxDim:cap,signal});cancelled(signal);
   const frame=processSource(drawable.source,drawable.width,drawable.height,file.name,trainMaxDim,{featMaxDim},drawable.method!=='bitmap-native');
   cancelled(signal);
   try{frame.exif=await readExifFocal(file)}catch{frame.exif=null}
   frames.push(frame);
   if(drawable.method!=='bitmap-resized')fallbacks.push({index:i+1,name:file.name,method:drawable.method,previous:drawable.previous||[]});
   onProgress({stage:'decode',done:i+1,total:files.length,message:'Готово '+(i+1)+'/'+files.length+': '+file.name+' ('+drawable.method+')'});
  }catch(error){
   cancelled(signal);
   failures.push({index:i+1,name:file.name,message:String(error?.message||error)});
   onProgress({stage:'decode',done:i+1,total:files.length,message:'Не удалось декодировать '+file.name+': '+(error?.message||error)});
  }finally{drawable?.release?.()}
 }
 cancelled(signal);
 if(failures.length)throw Error('Не прочитаны '+failures.length+' из '+files.length+' фотографий: '+failures.slice(0,4).map(x=>x.name+' — '+x.message).join('; ')+(failures.length>4?' …':''));
 return {frames,fallbacks,failures};
}
