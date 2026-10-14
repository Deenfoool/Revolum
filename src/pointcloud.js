// Pure point-cloud operations: local-space spatial voxelization and portable PLY.
// No assumptions of metric scale: caller supplies a fraction of the cloud bbox diagonal.
export function selectVoxelPoints(position,{fraction=.025,maxPoints=2000000}={}){
 if(!position||position.length%3||position.length<6)throw Error('Облако точек не содержит достаточно вершин');
 const n=position.length/3;if(n>maxPoints)throw Error('Облако слишком велико для этого инструмента (лимит 2 млн точек)');
 if(!(fraction>0&&fraction<=.25))throw Error('Неверный размер вокселя');
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<position.length;i+=3){
   for(let j=0;j<3;j++){const v=position[i+j];if(!Number.isFinite(v))throw Error('Облако содержит недопустимые координаты');min[j]=Math.min(min[j],v);max[j]=Math.max(max[j],v)}
 }
 const diagonal=Math.hypot(...max.map((v,j)=>v-min[j]));
 if(!(diagonal>1e-12))throw Error('Все точки совпадают: прореживание невозможно');
 const size=diagonal*fraction,seen=new Set(),indices=[];
 for(let i=0;i<n;i++){
   const k=3*i;
   const key=[0,1,2].map(j=>Math.floor((position[k+j]-min[j])/size)).join(':');
   if(seen.has(key))continue;
   seen.add(key);indices.push(i);
 }
 return {indices:Uint32Array.from(indices),sourceCount:n,remaining:indices.length,voxelSize:size,diagonal};
}
export function encodeCloudPly(position,indices,colors=null){
 if(!position||position.length%3)throw Error('Неверные координаты PLY');
 if(!indices?.length)throw Error('Нечего экспортировать');
 const n=position.length/3,colored=!!colors;
 if(colored&&colors.length!==position.length)throw Error('Число цветов не соответствует точкам');
 const header='ply\nformat binary_little_endian 1.0\ncomment Revolum voxel-reduced point cloud (local arbitrary units)\nelement vertex '+indices.length+'\nproperty float x\nproperty float y\nproperty float z\n'+(colored?'property uchar red\nproperty uchar green\nproperty uchar blue\n':'')+'end_header\n';
 const bytes=new TextEncoder().encode(header),stride=colored?15:12,buffer=new ArrayBuffer(indices.length*stride),view=new DataView(buffer);
 for(let i=0;i<indices.length;i++){
   const id=indices[i];if(!Number.isInteger(id)||id>=n)throw Error('Недопустимый индекс точки');
   const at=id*3,offset=i*stride;
   for(let j=0;j<3;j++){const v=position[at+j];if(!Number.isFinite(v))throw Error('Недопустимая координата точки');view.setFloat32(offset+j*4,v,true)}
   if(colored)for(let j=0;j<3;j++){const v=colors[at+j];view.setUint8(offset+12+j,Math.max(0,Math.min(255,Math.round((v<=1?v*255:v)||0))))}
 }
 return new Blob([bytes,buffer],{type:'application/octet-stream'});
}
