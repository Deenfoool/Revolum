import {reconstructDense} from './mvs-core.js';
import {prepareMesh} from './mesh-quality.js';
self.onmessage=({data})=>{
 if(data?.type!=='build')return;
 try{
  const progress=stage=>self.postMessage({type:'progress',id:data.id,...stage});
  const result=reconstructDense(data.payload,{resolution:data.resolution,onProgress:progress});
  progress({stage:'quality',message:'Проверка топологии, удаление вырожденных граней и мелких фрагментов…'});
  const cleaned=prepareMesh(result,{pruneSmall:data.cleanSmall!==false});
  const stats={...result.stats,vertices:cleaned.quality.vertices,triangles:cleaned.quality.triangles,quality:cleaned.quality};
  self.postMessage({type:'result',id:data.id,positions:cleaned.positions,colors:cleaned.colors,indices:cleaned.indices,stats},
    [cleaned.positions.buffer,cleaned.colors.buffer,cleaned.indices.buffer]);
 }catch(error){self.postMessage({type:'error',id:data.id,message:error?.message||String(error)})}
};
