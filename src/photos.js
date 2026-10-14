export const PHOTO_EXTENSIONS=['jpg','jpeg','png','webp','heic','heif'];
export const formatSize=bytes=>bytes>=1024**3?(bytes/1024**3).toFixed(2)+' GB':bytes>=1024**2?(bytes/1024**2).toFixed(1)+' MB':Math.ceil(bytes/1024)+' KB';
export function isPhoto(file){return PHOTO_EXTENSIONS.includes((file.name||'').toLowerCase().split('.').pop())}
const luma=(data,i)=>.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
export function hashDistance(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==64||b.length!==64)return Infinity;
  let distance=0;for(let i=0;i<64;i++)if(a[i]!==b[i])distance++;return distance;
}
export function photoIssues(photo,preceding=[]) {
  const issues=[...(photo.flags||[])];
  if(photo.hash&&preceding.some(p=>p.hash&&hashDistance(photo.hash,p.hash)<=3&&Math.abs((photo.mean??0)-(p.mean??0))<12))issues.push('Возможно повторяющийся ракурс');
  return issues;
}
function imageMetrics(bitmap){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('Canvas недоступен');
  context.drawImage(bitmap,0,0,128,128);
  const data=context.getImageData(0,0,128,128).data;
  let sum=0,dark=0,bright=0,edge=0;
  const gray=new Float32Array(128*128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const index=y*128+x,l=luma(data,index*4);gray[index]=l;sum+=l;
    if(l<14)dark++;if(l>244)bright++;
  }
  // Coarse high-frequency estimate: a warning, not a reliable focus detector.
  for(let y=1;y<127;y+=2)for(let x=1;x<127;x+=2){
    const i=y*128+x;
    edge+=Math.abs(4*gray[i]-gray[i-1]-gray[i+1]-gray[i-128]-gray[i+128]);
  }
  canvas.width=9;canvas.height=8;context.drawImage(bitmap,0,0,9,8);
  const small=context.getImageData(0,0,9,8).data;
  let hash='';for(let y=0;y<8;y++)for(let x=0;x<8;x++)hash+=luma(small,(y*9+x)*4)>luma(small,(y*9+x+1)*4)?'1':'0';
  return {mean:sum/(128*128),darkRatio:dark/(128*128),brightRatio:bright/(128*128),edgeScore:edge/(63*63),hash};
}
export async function inspectPhoto(file){
  if(file.size>50*1024*1024)throw Error('Фото '+file.name+' больше 50 МБ');
  let bitmap=null;
  try {
    bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
    const width=bitmap.width,height=bitmap.height,flags=[];
    if(width<1600||height<1200)flags.push('Низкое разрешение');
    const {mean,darkRatio,brightRatio,edgeScore,hash}=imageMetrics(bitmap);
    if(mean<45||darkRatio>.55)flags.push('Возможно слишком темно');
    if(mean>220||brightRatio>.55)flags.push('Возможно пересвет');
    if(edgeScore<7)flags.push('Мало текстуры / возможный смаз');
    return {width,height,flags,hash,mean,sharpness:Math.round(edgeScore*10)/10};
  } catch(error) {throw Error('Не удалось прочитать '+file.name+'. Формат может не поддерживаться браузером.')}
  finally {bitmap?.close()}
}
export function photoView(photo){return {id:photo.id,file:photo.file,width:photo.width,height:photo.height,flags:photo.flags||[],hash:photo.hash,mean:photo.mean,sharpness:photo.sharpness}}
