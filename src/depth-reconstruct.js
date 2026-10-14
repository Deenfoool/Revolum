import * as THREE from 'three';
import {depthGrid,percentileRange} from './depth-grid.js';
let worker=null,waiting=null;
function instance(){
  if(worker)return worker;
  worker=new Worker(new URL('./depth-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(!waiting)return;
    if(data.type==='progress'){waiting.progress?.(data);return}
    if(data.id!==waiting.id)return;
    const current=waiting;waiting=null;
    if(data.type==='error')current.reject(Error(data.message));
    else if(data.type==='result')current.resolve(data);
  };
  worker.onerror=e=>{
    if(waiting){waiting.reject(Error('ML Worker: '+(e.message||'не удалось загрузить движок')));waiting=null}
    worker?.terminate();worker=null;
  };
  return worker;
}
export function estimateDepth(file,progress){
  if(waiting)throw Error('Реконструкция уже выполняется');
  if(!file?.size||file.size>50*1024*1024)throw Error('Нужен файл фотографии размером до 50 МБ');
  const id=crypto.randomUUID?.()||String(Date.now());
  return new Promise((resolve,reject)=>{
    waiting={id,resolve,reject,progress};
    try{instance().postMessage({type:'reconstruct',id,file})}
    catch(e){waiting=null;reject(e)}
  });
}
export function cancelDepth(){
  if(waiting){waiting.reject(Error('Операция отменена пользователем'));waiting=null}
  worker?.terminate();worker=null;
}
export async function depthGeometry(file,prediction,{columns=160,strength=.9}={}){
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  try{
    const width=bitmap.width,height=bitmap.height;
    const grid=depthGrid({depth:prediction.depth,width:prediction.width,height:prediction.height,imageWidth:width,imageHeight:height,columns,amplitude:strength});
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(grid.positions,3));
    geometry.setAttribute('uv',new THREE.BufferAttribute(grid.uv,2));
    geometry.setIndex(new THREE.BufferAttribute(grid.indices,1));
    geometry.computeVertexNormals();
    const canvas=document.createElement('canvas'),scale=Math.min(1,2048/Math.max(width,height));
    canvas.width=Math.max(2,Math.round(width*scale));canvas.height=Math.max(2,Math.round(height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=4;
    return {geometry,texture,grid};
  }finally{bitmap.close()}
}
export function drawDepthPreview(canvas,prediction){
  const {depth,width,height}=prediction,{lo,hi}=percentileRange(depth);
  canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  const image=ctx.createImageData(width,height),scale=255/(hi-lo);
  for(let i=0;i<depth.length;i++){
    const v=Math.round(Math.min(255,Math.max(0,(depth[i]-lo)*scale)));
    image.data[i*4]=v;image.data[i*4+1]=v;image.data[i*4+2]=v;image.data[i*4+3]=255;
  }
  ctx.putImageData(image,0,0);
}
