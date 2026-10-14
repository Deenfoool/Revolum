// Single WebGPU device acquisition for Revolum + the pinned Splat.js session.
// A browser AbortError without our signal is NOT a user-requested cancellation.
export const userCancelled=signal=>!!signal?.aborted;
export function scanError(error,{phase='preflight',signal}={}){
 const name=String(error?.name||''),msg=String(error?.message||error||'Неизвестная ошибка');
 if(userCancelled(signal)||msg==='Реконструкция отменена')return Error('Расчёт отменён пользователем.');
 const abort=name==='AbortError'||/^(?:The operation was aborted\.?|The operation was aborted due to an error\.?|AbortError)$/i.test(msg);
 const labels={
  preflight:'инициализации WebGPU',decode:'декодирования изображений',
  solve:'расчёта SfM',seed:'создания и настройки Gaussian Splats',ready:'подготовки просмотрщика',training:'обучения'
 };
 const where=labels[phase]||phase;
 if(abort)return Error('Браузер прервал операцию на этапе '+where+'. Это не нажатие «Отменить». '+
  (phase==='preflight'?'Проверьте поддержку WebGPU и аппаратное ускорение, попробуйте совместимый браузер или другой GPU.':
   phase==='decode'?'Уменьшите размер фотосета, проверьте декодирование снимков и наличие свободной памяти.':
   'Проверьте WebGPU/драйвер и свободную память, уменьшите профиль и число фотографий.')+
  ' ('+(name||'AbortError')+': '+msg+')');
 return Error('Ошибка на этапе '+where+': '+msg);
}
export async function acquireScanDevice(gpu,{signal,onStage=()=>{}}={}){
 if(!gpu||typeof gpu.requestAdapter!=='function')throw Error('WebGPU не поддерживается этим браузером.');
 const abort=()=>{if(signal?.aborted)throw Error('Реконструкция отменена')};
 abort();
 let last=null;
 for(const powerPreference of ['high-performance','low-power']){
  let device=null;
  try{
   onStage(powerPreference==='high-performance'?'WebGPU: проверка высокопроизводительного адаптера…':'WebGPU: повторная попытка с альтернативным адаптером…');
   const adapter=await gpu.requestAdapter({powerPreference});
   abort();
   if(!adapter){last=Error('GPU-адаптер недоступен ('+powerPreference+')');continue}
   const binding=adapter.limits?.maxStorageBufferBindingSize,buffer=adapter.limits?.maxBufferSize;
   if(!(binding>=16*1048576)||!(buffer>=16*1048576))throw Error('Недостаточные лимиты WebGPU');
   const wanted=4*1073741824;
   const limits={maxStorageBufferBindingSize:Math.min(binding,wanted),maxBufferSize:Math.min(buffer,wanted)};
   onStage('WebGPU: создание устройства без необязательных расширений…');
   device=await adapter.requestDevice({requiredFeatures:[],requiredLimits:limits});
   if(signal?.aborted){device?.destroy?.();device=null;abort()}
   if(!device)throw Error('WebGPU не вернул устройство');
   return {device,adapter,bindingLimit:binding,powerPreference};
  }catch(error){
   if(device){try{device.destroy?.()}catch{}}
   abort();
   last=error;
  }
 }
 throw last||Error('Совместимый WebGPU-адаптер недоступен');
}
