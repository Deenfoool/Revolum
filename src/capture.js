// Video/camera capture stays local to this browser. No network upload.
export function sampleTimes(duration, count=24) {
  if(!Number.isFinite(duration)||duration<=0)throw Error('У видео неизвестная длительность');
  const samples=Math.max(1,Math.min(48,Math.floor(count)||1));
  const start=Math.min(.2,duration*.02),end=Math.max(start,duration-Math.min(.2,duration*.02));
  if(samples===1)return [duration/2];
  return Array.from({length:samples},(_,i)=>start+(end-start)*(i/(samples-1)));
}
function waitFor(video,event,timeout=12000) {
  return new Promise((resolve,reject)=>{
    const done=(error)=>{clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener('error',bad);error?reject(error):resolve()};
    const ok=()=>done(),bad=()=>done(Error('Видео не удалось декодировать'));
    const timer=setTimeout(()=>done(Error('Операция с видео превысила время ожидания')),timeout);
    video.addEventListener(event,ok,{once:true});video.addEventListener('error',bad,{once:true});
  });
}
const fileFromCanvas=(canvas,name,quality=.88)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(new File([blob],name,{type:'image/jpeg',lastModified:Date.now()})):reject(Error('Не удалось создать изображение')), 'image/jpeg',quality));
export async function videoFrames(file,{count=24,onProgress=()=>{},signal}={}) {
  if(file.size>350*1024*1024)throw Error('Максимальный размер видео — 350 МБ');
  if(signal?.aborted)throw Error('Извлечение кадров отменено');
  const url=URL.createObjectURL(file),video=document.createElement('video');
  video.preload='auto';video.muted=true;video.playsInline=true;video.src=url;
  try {
    await waitFor(video,'loadedmetadata',20000);
    if(!video.videoWidth||!video.videoHeight)throw Error('Не удалось определить размеры видео');
    if(video.duration>300)throw Error('Для этой версии длительность видео ограничена 5 минутами');
    const times=sampleTimes(video.duration,count),canvas=document.createElement('canvas');
    const factor=Math.min(1,2560/Math.max(video.videoWidth,video.videoHeight));
    canvas.width=Math.round(video.videoWidth*factor);canvas.height=Math.round(video.videoHeight*factor);
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas недоступен');
    const files=[];let index=0;
    for(const time of times) {
      if(signal?.aborted)throw Error('Извлечение кадров отменено');
      video.currentTime=Math.min(time,Math.max(0,video.duration-.005));
      await waitFor(video,'seeked',12000);
      if(signal?.aborted)throw Error('Извлечение кадров отменено');
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      index++;files.push(await fileFromCanvas(canvas,'frame-'+String(index).padStart(3,'0')+'-'+String(Math.round(time*1000)).padStart(7,'0')+'ms.jpg'));
      onProgress(index,times.length);
    }
    return files;
  } finally {video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}
export async function captureCameraFrame(video) {
  if(!video.videoWidth||!video.videoHeight)throw Error('Камера ещё не готова');
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);
  return fileFromCanvas(canvas,'camera-'+new Date().toISOString().replace(/[:.]/g,'-')+'.jpg',.94);
}
