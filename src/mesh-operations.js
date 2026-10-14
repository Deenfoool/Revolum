// Keep large geometry operations off the main UI thread; original mesh is not
// modified until a valid GLB snapshot has successfully been generated.
export function runMeshOperation(mesh,method,cellRatio){
 if(!['simplify','orient'].includes(method))return Promise.reject(Error('Неизвестная операция'));
 const id=crypto.randomUUID?.()||String(Date.now());
 return new Promise((resolve,reject)=>{
   let worker;
   try{worker=new Worker(new URL('./mesh-tools-worker.js',import.meta.url),{type:'module'})}
   catch(error){reject(Error('Mesh Worker: '+error.message));return}
   const done=(error,result)=>{worker.terminate();error?reject(error):resolve(result)};
   worker.onmessage=({data})=>{
     if(data?.id!==id)return;
     if(data.type==='error')done(Error(data.message));
     else if(data.type==='result')done(null,data.result);
   };
   worker.onerror=e=>done(Error('Mesh Worker: '+(e.message||'ошибка вычисления')));
   try{worker.postMessage({type:'process',id,mesh,method,cellRatio},[mesh.positions.buffer,mesh.colors.buffer,mesh.indices.buffer])}
   catch(error){done(error)}
 });
}
