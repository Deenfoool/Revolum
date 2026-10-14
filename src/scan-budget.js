// Conservative resource planning for the pinned Splat.js training pipeline.
// WebGPU training targets are packed RGBA8 (4 bytes per pixel), while decoded
// CPU frames take substantially more; never promise this estimates all VRAM.
export const SCAN_PROFILES=Object.freeze({
  economy:{label:'Экономия памяти',trainMaxDim:640,featMaxDim:480,initTarget:6000,itersPerFrame:4},
  balanced:{label:'Сбалансированный',trainMaxDim:960,featMaxDim:720,initTarget:18000,itersPerFrame:6},
  detail:{label:'Повышенная детализация',trainMaxDim:1280,featMaxDim:960,initTarget:30000,itersPerFrame:8},
});
const ceilMB=v=>Math.ceil(v/1048576);
const isPano=p=>p.height>0&&Math.abs(p.width/p.height-2)<.05;
export function planScanBudget(photos,{profile='balanced',bindingLimit=128*1048576}={}){
  const preset=SCAN_PROFILES[profile];if(!preset)throw Error('Неизвестный профиль реконструкции');
  if(!Array.isArray(photos)||photos.length<8||photos.length>120)throw Error('Требуется от 8 до 120 фотографий');
  if(!Number.isFinite(bindingLimit)||bindingLimit<16*1048576)throw Error('Невозможно определить лимит WebGPU');
  for(const p of photos)if(!(p.width>=64&&p.height>=64))throw Error('Невозможно определить размеры каждого кадра. Загрузите декодируемые фотографии.');
  const panos=photos.filter(isPano);
  if(panos.length&&panos.length!==photos.length)throw Error('Нельзя смешивать обычные фото и панорамы 360° в одном скане');
  // Vendor splits each equirect into SIX square faces; account for those rather
  // than underestimating the GPU target by a factor of six.
  const face=Math.max(512,Math.min(1280,Math.round(Math.max(0,...panos.map(p=>p.width))/4/64)*64));
  const dims=panos.length?Array.from({length:photos.length*6},()=>({width:face,height:face})):photos;
  const limit=Math.min(bindingLimit*.54,384*1048576); // leave room for other GPU buffers
  const bytesFor=cap=>dims.reduce((sum,p)=>{
    const scale=Math.min(1,cap/Math.max(p.width,p.height));
    return sum+4*Math.max(2,Math.round(p.width*scale))*Math.max(2,Math.round(p.height*scale));
  },0);
  const ceiling=preset.trainMaxDim,minimum=224;
  if(bytesFor(minimum)>limit)throw Error('Фотосет превышает безопасный лимит WebGPU даже при 224 px. Уменьшите число снимков или выберите устройство с большим объёмом видеопамяти.');
  let lo=minimum,hi=ceiling;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(bytesFor(mid)<=limit)lo=mid;else hi=mid-1}
  const cap=lo;const packedBytes=bytesFor(cap);
  // This is only a budget for the packed image targets, NOT total memory.
  const cpuBytes=dims.reduce((sum,p)=>{
    const scale=Math.min(1,cap/Math.max(p.width,p.height));
    const pixels=Math.round(p.width*scale)*Math.round(p.height*scale);
    return sum+pixels*16;
  },0);
  return {profile,profileLabel:preset.label,trainMaxDim:cap,featMaxDim:Math.min(preset.featMaxDim,cap),
    initTarget:preset.initTarget,itersPerFrame:preset.itersPerFrame,
    inputPhotos:photos.length,frames:dims.length,panorama:!!panos.length,
    bindingLimitMB:ceilMB(bindingLimit),packedMB:ceilMB(packedBytes),
    cpuEstimateMB:ceilMB(cpuBytes),limited:cap<ceiling,
    warning:cap<ceiling?'Разрешение автоматически снижено с '+ceiling+' до '+cap+' px из-за лимита GPU.':null};
}
