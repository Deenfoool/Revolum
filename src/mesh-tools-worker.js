import {simplifyMesh,orientMesh} from './mesh-tools.js';
self.onmessage=({data})=>{
 if(data?.type!=='process')return;
 try{
   const result=data.method==='simplify'?simplifyMesh(data.mesh,{cellRatio:data.cellRatio}):data.method==='orient'?orientMesh(data.mesh):null;
   if(!result)throw Error('Неизвестная операция Mesh');
   self.postMessage({type:'result',id:data.id,result},[result.positions.buffer,result.colors.buffer,result.indices.buffer]);
 }catch(error){self.postMessage({type:'error',id:data.id,message:error?.message||String(error)})}
};
