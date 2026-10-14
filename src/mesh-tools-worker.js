import {simplifyMesh,orientMesh} from './mesh-tools.js';
import {decimateQEM} from './mesh-qem.js';
import {auditMesh} from './mesh-audit.js';
self.onmessage=({data})=>{
 if(data?.type!=='process')return;
 try{
   if(data.method==='audit'){
     const report=auditMesh(data.mesh);
     self.postMessage({type:'result',id:data.id,result:report});return;
   }
   const result=data.method==='simplify'?simplifyMesh(data.mesh,{cellRatio:data.cellRatio}):
     data.method==='orient'?orientMesh(data.mesh):
     data.method==='qem'?decimateQEM(data.mesh,{targetRatio:data.cellRatio}):null;
   if(!result)throw Error('Неизвестная операция Mesh');
   self.postMessage({type:'result',id:data.id,result},[result.positions.buffer,result.colors.buffer,result.indices.buffer]);
 }catch(error){self.postMessage({type:'error',id:data.id,message:error?.message||String(error)})}
};
