import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireScanDevice,scanError} from '../src/splat-preflight.js';

const MB=1048576;
const adapter=({error=null,onCreated=()=>{}}={})=>({
 limits:{maxStorageBufferBindingSize:128*MB,maxBufferSize:256*MB},
 async requestDevice(opts){
   assert.deepEqual(opts.requiredFeatures,[]);
   assert.equal(opts.requiredLimits.maxStorageBufferBindingSize,128*MB);
   assert.equal(opts.requiredLimits.maxBufferSize,256*MB);
   if(error)throw error;
   const device={destroy(){device.destroyed=true}};onCreated(device);return device;
 }
});
test('one adapter and one device are acquired for the SfM/training session',async()=>{
 const calls=[],a=adapter();
 const gpu={async requestAdapter(opts){calls.push(opts.powerPreference);return a}};
 const result=await acquireScanDevice(gpu,{signal:new AbortController().signal});
 assert.deepEqual(calls,['high-performance']);
 assert.equal(result.bindingLimit,128*MB);
 assert.equal(result.powerPreference,'high-performance');
 assert.equal(typeof result.device.destroy,'function');
});
test('browser AbortError during first WebGPU acquisition retries alternate adapter (not classified as user cancellation)',async()=>{
 let tries=0;const steps=[];
 const gpu={async requestAdapter(opts){
  tries++;
  if(opts.powerPreference==='high-performance')throw new DOMException('The operation was aborted.','AbortError');
  return adapter();
 }};
 const r=await acquireScanDevice(gpu,{onStage:m=>steps.push(m)});
 assert.equal(tries,2);assert.equal(r.powerPreference,'low-power');assert.equal(steps.length,3);
 assert.match(scanError(new DOMException('The operation was aborted.','AbortError'),{phase:'preflight'}).message,/Браузер прервал.*WebGPU/);
});
test('retries a failed WebGPU device creation, without losing the diagnostic error',async()=>{
 const gpu={async requestAdapter(o){return o.powerPreference==='high-performance'?adapter({error:new DOMException('The operation was aborted.','AbortError')}):adapter()}};
 const result=await acquireScanDevice(gpu);assert.equal(result.powerPreference,'low-power');
 const noDevice={async requestAdapter(){throw new DOMException('The operation was aborted.','AbortError')}};
 await assert.rejects(acquireScanDevice(noDevice),{name:'AbortError'});
});
test('intentional cancellation does not retry, and a late-acquired device gets destroyed',async()=>{
 const ac=new AbortController();let calls=0,device;
 const gpu={async requestAdapter(){calls++;ac.abort();return adapter({onCreated:x=>device=x})}};
 await assert.rejects(acquireScanDevice(gpu,{signal:ac.signal}),/Реконструкция отменена/);
 assert.equal(calls,1);
 const ac2=new AbortController();
 const gpu2={async requestAdapter(){return adapter({onCreated:x=>{device=x;ac2.abort()}})}};
 await assert.rejects(acquireScanDevice(gpu2,{signal:ac2.signal}),/Реконструкция отменена/);
 assert.equal(device.destroyed,true);
 assert.equal(scanError(new DOMException('SfM aborted','AbortError'),{phase:'solve',signal:ac2.signal}).message,'Расчёт отменён пользователем.');
});
test('non-user decode AbortError names its stage and provides an actionable message',()=>{
 const err=scanError(new DOMException('The operation was aborted.','AbortError'),{phase:'decode'});
 assert.match(err.message,/декодирования изображений/);assert.match(err.message,/не нажатие/);
 const generic=scanError(Error('broken shader'),{phase:'seed'});
 assert.match(generic.message,/создания и настройки Gaussian Splats.*broken shader/);
});
