// Browser MVS: robustly align monocular relative depths to SfM camera Z,
// integrate independent registered views into a bounded signed-distance grid,
// then extract a real polygon surface using marching tetrahedra.
//
// This is depth-assisted MVS, NOT exact metric/photometric stereo or guaranteed
// watertight reconstruction. No mesh is emitted without multi-camera evidence.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:NaN};
export function cameraPoint(cam,X){
 const R=cam.R,t=cam.t;
 return [R[0]*X[0]+R[1]*X[1]+R[2]*X[2]+t[0],
 R[3]*X[0]+R[4]*X[1]+R[5]*X[2]+t[1],
 R[6]*X[0]+R[7]*X[1]+R[8]*X[2]+t[2]];
}
export function project(cam,X){
 const p=cameraPoint(cam,X);if(!(p[2]>1e-6))return null;
 const fy=cam.fy??cam.f*(cam.aspect||1);
 return {u:cam.f*p[0]/p[2]+cam.cx,v:fy*p[1]/p[2]+cam.cy,z:p[2]};
}
export function sampleScalar(data,w,h,u,v){
 if(w<2||h<2||data?.length!==w*h||u<0||v<0||u>w-1||v>h-1)return NaN;
 const x=Math.floor(u),y=Math.floor(v),xx=Math.min(x+1,w-1),yy=Math.min(y+1,h-1),a=u-x,b=v-y;
 const v0=data[y*w+x],v1=data[y*w+xx],v2=data[yy*w+x],v3=data[yy*w+xx];
 return (v0*(1-a)+v1*a)*(1-b)+(v2*(1-a)+v3*a)*b;
}
function depthAt(view,u,v){
 return sampleScalar(view.depth,view.width,view.height,u*(view.width-1)/view.fw,v*(view.height-1)/view.fh);
}
function anchorPairs(cam,view,points){
 const buckets=new Map(),stride=Math.max(1,Math.floor(points.length/16000));
 for(let i=0;i<points.length;i+=stride){
  const X=points[i]?.X;if(!X||X.length!==3||!X.every(Number.isFinite))continue;
  const p=project(cam,X);
  if(!p||p.u<2||p.v<2||p.u>view.fw-3||p.v>view.fh-3)continue;
  const d=depthAt(view,p.u,p.v);if(!Number.isFinite(d))continue;
  const key=Math.floor(p.u/view.fw*80)+80*Math.floor(p.v/view.fh*80);
  const prev=buckets.get(key);if(!prev||p.z<prev.z)buckets.set(key,{d,z:p.z});
 }
 return [...buckets.values()];
}
export function fitRelativeDepth(cam,view,points){
 const anchors=anchorPairs(cam,view,points);
 if(anchors.length<18)throw Error('Мало видимых SfM-опор ('+anchors.length+')');
 const depths=anchors.map(p=>p.d),zs=anchors.map(p=>p.z),span=median(zs.map(z=>Math.abs(z-median(zs))))*2.965;
 const dSpan=Math.max(...depths)-Math.min(...depths);
 if(!(dSpan>1e-5)&&!(span>1e-6))throw Error('Карта глубины не имеет различимого рельефа');
 if(!(dSpan>1e-5))throw Error('ML-карта глубины почти постоянна');
 const threshold=Math.max(span*.13,median(zs)*.025,1e-4);
 let best=null,seed=12345;
 for(let t=0;t<192;t++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const i=seed%anchors.length;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%anchors.length;
  if(i===j||Math.abs(anchors[i].d-anchors[j].d)<dSpan*.08)continue;
  const a=(anchors[j].z-anchors[i].z)/(anchors[j].d-anchors[i].d),b=anchors[i].z-a*anchors[i].d;
  if(!Number.isFinite(a)||!Number.isFinite(b))continue;
  const inliers=anchors.filter(p=>Math.abs(a*p.d+b-p.z)<threshold);
  if(!best||inliers.length>best.length)best=inliers;
 }
 if(!best||best.length<Math.max(12,Math.ceil(anchors.length*.28)))throw Error('Несогласованная глубина: '+(best?.length||0)+' из '+anchors.length+' опор');
 let mx=0,my=0;for(const p of best){mx+=p.d;my+=p.z}mx/=best.length;my/=best.length;
 let num=0,den=0;for(const p of best){num+=(p.d-mx)*(p.z-my);den+=(p.d-mx)**2}
 if(den<1e-9)throw Error('Невозможно откалибровать глубину');
 const a=num/den,b=my-a*mx;
 const error=median(best.map(p=>Math.abs(a*p.d+b-p.z)));
 if(!(error<Math.max(span*.14,median(zs)*.04,1e-4)))throw Error('Высокая ошибка калибровки глубины');
 const positive=anchors.filter(p=>a*p.d+b>1e-6).length;
 if(positive<anchors.length*.8)throw Error('Некорректный диапазон согласованной глубины');
 return {...view,cam,a,b,anchors:anchors.length,inliers:best.length,medianError:error};
}
export function volumeBounds(points){
 const valid=points.filter(p=>p?.X?.length===3&&p.X.every(Number.isFinite));
 if(valid.length<30)throw Error('Недостаточно SfM-точек для построения общего объёма');
 const box=[0,1,2].map(j=>{const v=valid.map(p=>p.X[j]).sort((a,b)=>a-b);return [v[Math.floor((v.length-1)*.025)],v[Math.floor((v.length-1)*.975)]]});
 const rawMin=box.map(p=>p[0]),rawMax=box.map(p=>p[1]),diag=Math.hypot(...rawMin.map((v,j)=>rawMax[j]-v));
 if(!(diag>1e-5))throw Error('SfM-облако вырождено');
 return {min:rawMin.map((v,j)=>v-diag*.12),max:rawMax.map((v,j)=>v+diag*.12),diag};
}
export function integrateTSDF(views,points,{resolution=56,onProgress=()=>{}}={}){
 if(!Array.isArray(views)||views.length<3)throw Error('Нужно хотя бы три согласованные карты глубины');
 const bound=volumeBounds(points),size=bound.max.map((v,i)=>v-bound.min[i]);
 const longest=Math.max(...size),dim=clamp(Math.round(resolution),32,80);
 const step=longest/(dim-1),nx=Math.ceil(size[0]/step)+1,ny=Math.ceil(size[1]/step)+1,nz=Math.ceil(size[2]/step)+1;
 const total=nx*ny*nz;if(total>650000)throw Error('Объём превышает бюджет памяти');
 const values=new Float32Array(total),counts=new Uint8Array(total),trunc=step*3.2;
 const at=(x,y,z)=>(z*ny+y)*nx+x;
 for(let z=0;z<nz;z++){
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const X=[bound.min[0]+x*step,bound.min[1]+y*step,bound.min[2]+z*step];let sum=0,weight=0;
   for(const view of views){
    const p=project(view.cam,X);
    if(!p||p.u<1||p.v<1||p.u>=view.fw-1||p.v>=view.fh-1)continue;
    const d=depthAt(view,p.u,p.v),pred=view.a*d+view.b,diff=pred-p.z;
    if(!Number.isFinite(diff)||!(pred>0)||diff < -trunc*1.5||diff>trunc*2.8)continue;
    const tsdf=clamp(diff/trunc,-1,1);sum+=tsdf;weight++;
   }
   const index=at(x,y,z);if(weight>=2){values[index]=sum/weight;counts[index]=weight}
  }
  if(z%4===0)onProgress({stage:'fusion',done:z+1,total:nz});
 }
 const covered=counts.reduce((n,c)=>n+(c>=2),0);
 if(covered<100)throw Error('Слишком мало областей, подтверждённых несколькими камерами');
 return {values,counts,nx,ny,nz,min:bound.min,step,trunc,covered,views:views.length};
}
function imageColor(view,X){
 const p=project(view.cam,X);
 if(!p||p.u<1||p.v<1||p.u>=view.fw-1||p.v>=view.fh-1)return null;
 const d=depthAt(view,p.u,p.v),pred=view.a*d+view.b;
 if(!Number.isFinite(pred)||Math.abs(pred-p.z)>view.trunc*2.5)return null;
 const image=view.image;if(!image?.data?.length)return null;
 const u=clamp(Math.floor(p.u/view.fw*image.width),0,image.width-1),v=clamp(Math.floor(p.v/view.fh*image.height),0,image.height-1),idx=(v*image.width+u)*4;
 return [image.data[idx]/255,image.data[idx+1]/255,image.data[idx+2]/255];
}
export function extractMesh(grid,views,{onProgress=()=>{}}={}){
 const {values,counts,nx,ny,nz,min,step}=grid,idx=(x,y,z)=>(z*ny+y)*nx+x;
 const cube=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
 const tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
 const positions=[],colors=[],triangles=[],cache=new Map(),MAX_TRIANGLES=400000;
 function edge(a,b,world){
  const key=a<b?a+':'+b:b+':'+a;const cached=cache.get(key);if(cached!==undefined)return cached;
  const va=values[a],vb=values[b],t=clamp(va/(va-vb),0,1),p=world[0].map((v,i)=>v*(1-t)+world[1][i]*t);
  const vi=positions.length/3;positions.push(...p);
  let sum=[0,0,0],n=0;for(const view of views){const c=imageColor(view,p);if(c){for(let j=0;j<3;j++)sum[j]+=c[j];n++}}
  colors.push(...(n?sum.map(c=>c/n):[.65,.7,.72]));cache.set(key,vi);return vi;
 }
 function face(verts,inside,outside){
  const A=positions.slice(verts[0]*3,verts[0]*3+3),B=positions.slice(verts[1]*3,verts[1]*3+3),C=positions.slice(verts[2]*3,verts[2]*3+3);
  const u=B.map((v,i)=>v-A[i]),v=C.map((v,i)=>v-A[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const dir=outside.map((v,i)=>v-inside[i]),dot=normal.reduce((n,v,i)=>n+v*dir[i],0);
  if(dot<0)[verts[1],verts[2]]=[verts[2],verts[1]];
  triangles.push(...verts);if(triangles.length/3>MAX_TRIANGLES)throw Error('Сетка превышает лимит 400 000 треугольников: выберите меньшую детализацию');
 }
 for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
  const ids=cube.map(([dx,dy,dz])=>idx(x+dx,y+dy,z+dz));
  const coords=cube.map(([dx,dy,dz])=>[min[0]+(x+dx)*step,min[1]+(y+dy)*step,min[2]+(z+dz)*step]);
  for(const tet of tetra){
   if(tet.some(i=>counts[ids[i]]<2))continue;
   const ins=tet.filter(i=>values[ids[i]]<0),outs=tet.filter(i=>values[ids[i]]>=0);
   if(!ins.length||!outs.length)continue;
   const mean=list=>[0,1,2].map(j=>list.reduce((s,i)=>s+coords[i][j],0)/list.length),a=mean(ins),b=mean(outs);
   const cross=(i,j)=>edge(ids[i],ids[j],[coords[i],coords[j]]);
   if(ins.length===1){face(outs.map(j=>cross(ins[0],j)),a,b)}
   else if(outs.length===1){face(ins.map(j=>cross(j,outs[0])),a,b)}
   else{
    const q0=cross(ins[0],outs[0]),q1=cross(ins[0],outs[1]),q2=cross(ins[1],outs[0]),q3=cross(ins[1],outs[1]);
    face([q0,q1,q2],a,b);face([q1,q3,q2],a,b);
   }
  }
  if(x===nx-2&&y===ny-2&&z%4===0)onProgress({stage:'extract',done:z+1,total:nz-1});
 }
 if(triangles.length<300)throw Error('Недостаточно согласованных пересечений TSDF для Mesh. Увеличьте перекрытие ракурсов или используйте Gaussian PLY.');
 if(positions.length/3>500000)throw Error('Сетка слишком большая');
 return {positions:Float32Array.from(positions),colors:Float32Array.from(colors),indices:Uint32Array.from(triangles),stats:{vertices:positions.length/3,triangles:triangles.length/3,covered:grid.covered,views:views.length,watertight:false}};
}
export function reconstructDense(data,options={}){
 const selected=[];const failures=[];
 for(const view of data.views){
  try{selected.push(fitRelativeDepth(view.cam,view,data.points))}
  catch(error){failures.push({name:view.name||'Camera',reason:error.message})}
 }
 if(selected.length<3)throw Error('Не удалось согласовать хотя бы три независимых ракурса. '+failures.map(f=>f.name+': '+f.reason).slice(0,3).join(' · '));
 const grid=integrateTSDF(selected,data.points,{resolution:options.resolution,onProgress:options.onProgress});
 for(const v of selected)v.trunc=grid.trunc;
 const mesh=extractMesh(grid,selected,{onProgress:options.onProgress});
 return {...mesh,stats:{...mesh.stats,calibrated:selected.length,skipped:failures,grid:[grid.nx,grid.ny,grid.nz],relativeScale:true}};
}

export function encodeDensePly({positions,indices,colors}){
 const n=positions?.length/3,m=indices?.length/3;
 if(!Number.isInteger(n)||!Number.isInteger(m)||n<3||m<1||colors?.length!==positions.length)throw Error('Недопустимая геометрия полигонального PLY');
 if(n>500000||m>400000)throw Error('PLY превышает лимит экспорта');
 const header='ply\nformat binary_little_endian 1.0\ncomment Revolum SfM-aligned multi-view depth TSDF mesh; arbitrary scale\nelement vertex '+n+'\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face '+m+'\nproperty list uchar int vertex_indices\nend_header\n';
 const bytes=new TextEncoder().encode(header),vertices=new ArrayBuffer(n*15),faces=new ArrayBuffer(m*13);
 const dv=new DataView(vertices),df=new DataView(faces);
 for(let i=0;i<n;i++){
  const off=i*15;for(let j=0;j<3;j++){
   const p=positions[i*3+j];if(!Number.isFinite(p))throw Error('Неопределённая вершина');
   dv.setFloat32(off+j*4,p,true);
   dv.setUint8(off+12+j,Math.round(clamp(colors[i*3+j],0,1)*255));
  }
 }
 for(let i=0;i<m;i++){
  const off=i*13;df.setUint8(off,3);
  for(let j=0;j<3;j++){const v=indices[i*3+j];if(v>=n)throw Error('Индекс грани вне сетки');df.setInt32(off+1+j*4,v,true)}
 }
 return new Blob([bytes,vertices,faces],{type:'application/octet-stream'});
}
