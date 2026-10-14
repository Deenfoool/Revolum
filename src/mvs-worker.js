import {reconstructDense} from './mvs-core.js';
self.onmessage=({data})=>{
 if(data?.type!=='build')return;
 try{
  const result=reconstructDense(data.payload,{resolution:data.resolution,onProgress:stage=>self.postMessage({type:'progress',id:data.id,...stage})});
  self.postMessage({type:'result',id:data.id,...result},[result.positions.buffer,result.colors.buffer,result.indices.buffer]);
 }catch(error){self.postMessage({type:'error',id:data.id,message:error?.message||String(error)})}
};
