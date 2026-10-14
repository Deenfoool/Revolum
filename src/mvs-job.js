// MVS coordinator; inference is local (Depth Anything V2 WASM), dense fusion
// and mesh extraction run off the UI thread. Cancellation terminates the work.
import {estimateDepth,cancelDepth} from './depth-reconstruct.js';
export function matchSources(session,files){
 const byName=new Map();
 for(const file of files){if(byName.has(file.name))throw Error('Названия фотографий должны быть уникальными для соответствия SfM-камер');byName.set(file.name,file)}
 return session.recon.cams.map(cam=>{
  const frame=session.frames[cam.imgIdx];
  const file=byName.get(frame?.name);
  return {cam,frame,file};
 }).filter(({file,frame})=>file&&frame?.fw>=2&&frame?.fh>=2);
}
async function imagePreview(file,width=384){
 const bitmap=await createImageBitmap(file);
 try{
  const w=Math.min(width,bitmap.width),h=Math.max(2,Math.round(w*bitmap.height/bitmap.width));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas2D недоступен');
  ctx.drawImage(bitmap,0,0,w,h);
  const pixels=ctx.getImageData(0,0,w,h);canvas.width=0;canvas.height=0;
  return {width:w,height:h,data:new Uint8Array(pixels.data)};
 }finally{bitmap.close()}
}
export class DenseMeshJob {
 constructor(){this.busy=false;this.cancelled=false;this.worker=null;this.depthActive=false;this.pending=null}
 cancel(){
  this.cancelled=true;
  if(this.depthActive)cancelDepth();
  this.worker?.terminate();this.worker=null;
  this.pending?.reject(Error('Построение Mesh отменено'));this.pending=null;
 }
 async run(multiview,files,{resolution=56,maxViews=12,onProgress=()=>{}}={}){
  if(this.busy)throw Error('Dense Mesh уже строится');
  if(!multiview?.session?.recon?.cams?.length)throw Error('Сначала выполните SfM');
  if(![40,56,72].includes(resolution))throw Error('Неверная детализация');
  this.busy=true;this.cancelled=false;
  const check=()=>{if(this.cancelled)throw Error('Построение Mesh отменено')};
  try{
   const session=multiview.session;
   if(session.rigInfo)throw Error('Реконструкция 360° пока недоступна в плотном Mesh-режиме');
   const source=matchSources(session,files);
   if(source.length<3)throw Error('Недостаточно исходных фотографий, соответствующих SfM-камерам');
   // Evenly cover the registered camera path, without silently fusing an
   // unbounded number of inference tensors or exhausting browser memory.
   const max=Math.min(16,Math.max(3,maxViews));
   const indices=Array.from({length:Math.min(max,source.length)},(_,i)=>Math.round(i*(source.length-1)/(Math.min(max,source.length)-1)));
   const selected=indices.map(i=>source[i]),views=[];
   for(let i=0;i<selected.length;i++){
    check();
    const {cam,frame,file}=selected[i];
    onProgress({stage:'depth',done:i,total:selected.length,message:'ML-карты глубины: '+(i+1)+'/'+selected.length+' · '+file.name});
    this.depthActive=true;
    let prediction;
    try{prediction=await estimateDepth(file,e=>onProgress({stage:'model',message:e.message}))}
    finally{this.depthActive=false}
    check();
    const image=await imagePreview(file);check();
    views.push({cam:{R:Array.from(cam.R),t:Array.from(cam.t),f:cam.f,fy:cam.fy,cx:cam.cx??frame.fw/2,cy:cam.cy??frame.fh/2,aspect:cam.aspect},
      width:prediction.width,height:prediction.height,depth:prediction.depth,fw:frame.fw,fh:frame.fh,image,name:file.name});
   }
   onProgress({stage:'fusion',message:'Проверка камер и объединение глубины в TSDF…'});
   const points=session.recon.points.map(p=>({X:Array.from(p.X)})).filter(p=>p.X.length===3&&p.X.every(Number.isFinite));
   const worker=new Worker(new URL('./mvs-worker.js',import.meta.url),{type:'module'});this.worker=worker;
   const id=crypto.randomUUID?.()||String(Date.now());
   const result=await new Promise((resolve,reject)=>{
    this.pending={reject};
    worker.onmessage=({data})=>{
     if(data.id!==id)return;
     if(data.type==='progress')onProgress(data);
     else if(data.type==='error'){this.pending=null;reject(Error(data.message))}
     else if(data.type==='result'){this.pending=null;resolve(data)}
    };
    worker.onerror=e=>{this.pending=null;reject(Error('MVS Worker: '+(e.message||'ошибка вычисления')))};
    const transfers=views.flatMap(v=>[v.depth.buffer,v.image.data.buffer]);
    worker.postMessage({type:'build',id,payload:{views,points},resolution},transfers);
   });
   check();return result;
  }finally{
   this.worker?.terminate();this.worker=null;this.pending=null;this.depthActive=false;this.busy=false;
  }
 }
}
