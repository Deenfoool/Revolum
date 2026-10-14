import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeCapturePhotos} from '../src/decode-resilient.js';

function fakeCanvas(){
 let w=0,h=0;
 const canvas={get width(){return w},set width(v){w=v},get height(){return h},set height(v){h=v},getContext(){
  return {canvas,drawImage(){},getImageData(x,y,ww,hh){const bytes=new Uint8ClampedArray(ww*hh*4);for(let i=0;i<bytes.length;i+=4){bytes[i]=128;bytes[i+1]=130;bytes[i+2]=150;bytes[i+3]=255}return {data:bytes}},imageSmoothingEnabled:true,imageSmoothingQuality:'high'}
 }};
 return canvas;
}
const mk=()=>Array.from({length:8},(_,i)=>{const b=new Blob([new Uint8Array(256)],{type:'image/jpeg'});Object.defineProperty(b,'name',{value:'photo-'+i+'.jpg'});return b});
test('a browser AbortError from both ImageBitmap attempts is recovered by HTML canvas for every frame',async()=>{
 const native={bitmap:globalThis.createImageBitmap,Image:globalThis.Image,document:globalThis.document};
 const oldUrl={create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 let released=0,draws=0;
 globalThis.createImageBitmap=async()=>{throw new DOMException('The operation was aborted.','AbortError')};
 globalThis.Image=class{naturalWidth=1600;naturalHeight=1200;set src(v){this._src=v;if(v)queueMicrotask(()=>this.onload?.())}};
 globalThis.document={createElement(){const cv=fakeCanvas(),ctx=cv.getContext('2d'),draw=ctx.drawImage;ctx.drawImage=(...args)=>{draws++;draw(...args)};cv.getContext=()=>ctx;return cv}};
 URL.createObjectURL=()=> 'blob:fake';URL.revokeObjectURL=()=>released++;
 try{
  const files=mk(),events=[];
  const r=await decodeCapturePhotos(files,{photoMeta:files.map(()=>({width:1600,height:1200})),trainMaxDim:640,featMaxDim:480,onProgress:e=>events.push(e)});
  assert.equal(r.frames.length,8);
  assert.equal(r.fallbacks.filter(x=>x.method==='html-canvas').length,8);
  assert.equal(released,8);
  assert.ok(draws>=8);
  assert.equal(events.filter(e=>e.stage==='decode'&&e.done===8).length,1);
  assert.ok(r.frames.every(f=>f.fw>0&&f.rgb.length===f.tw*f.th*3));
 }finally{
  globalThis.createImageBitmap=native.bitmap;globalThis.Image=native.Image;globalThis.document=native.document;
  URL.createObjectURL=oldUrl.create;URL.revokeObjectURL=oldUrl.revoke;
 }
});
test('cancellation before any decode is not misreported as an image failure',async()=>{
 const ac=new AbortController();ac.abort();
 await assert.rejects(decodeCapturePhotos(mk(),{signal:ac.signal}),/Реконструкция отменена/);
});
