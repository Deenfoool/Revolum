// Conservative bounded quadric-error decimation for single indexed color mesh.
// Interior manifold edge collapses only; boundary vertices are locked.
// This does NOT support UV seams, skinning, textures or self-intersection prevention.
import {prepareMesh} from './mesh-quality.js';
const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
function quadrics(p,faces){
 const q=Array.from({length:p.length/3},()=>new Float64Array(10));
 for(const [a,b,c] of faces){
  const A=p.slice(a*3,a*3+3),B=p.slice(b*3,b*3+3),C=p.slice(c*3,c*3+3);
  const u=B.map((v,i)=>v-A[i]),v=C.map((v,i)=>v-A[i]);
  let x=u[1]*v[2]-u[2]*v[1],y=u[2]*v[0]-u[0]*v[2],z=u[0]*v[1]-u[1]*v[0];
  const len=Math.hypot(x,y,z);if(len<1e-13)continue;
  x/=len;y/=len;z/=len;const d=-(x*A[0]+y*A[1]+z*A[2]);
  const pl=[x,y,z,d],tensor=[];
  for(let i=0;i<4;i++)for(let j=i;j<4;j++)tensor.push(pl[i]*pl[j]);
  for(const id of [a,b,c])for(let i=0;i<10;i++)q[id][i]+=tensor[i];
 }
 return q;
}
function error(q,v){
 const [x,y,z]=v;
 return q[0]*x*x+2*q[1]*x*y+2*q[2]*x*z+2*q[3]*x+
 q[4]*y*y+2*q[5]*y*z+2*q[6]*y+q[7]*z*z+2*q[8]*z+q[9];
}
function optimum(q,A,B){
 const m=[q[0],q[1],q[2],q[1],q[4],q[5],q[2],q[5],q[7]];
 const b=[-q[3],-q[6],-q[8]],aug=[[...m.slice(0,3),b[0]],[...m.slice(3,6),b[1]],[...m.slice(6,9),b[2]]];
 let valid=true;
 for(let j=0;j<3;j++){
  let row=j;for(let r=j+1;r<3;r++)if(Math.abs(aug[r][j])>Math.abs(aug[row][j]))row=r;
  if(Math.abs(aug[row][j])<1e-10){valid=false;break}
  [aug[j],aug[row]]=[aug[row],aug[j]];
  const pivot=aug[j][j];for(let k=j;k<4;k++)aug[j][k]/=pivot;
  for(let r=0;r<3;r++)if(r!==j){const f=aug[r][j];for(let k=j;k<4;k++)aug[r][k]-=f*aug[j][k]}
 }
 const mid=A.map((v,i)=>(v+B[i])*.5),candidates=[A,B,mid];
 if(valid&&aug.every(row=>Number.isFinite(row[3])))candidates.push(aug.map(row=>row[3]));
 // Limit the candidate to the edge segment to avoid jumping to distant QEM minima.
 const delta=B.map((v,i)=>v-A[i]),length2=delta.reduce((s,x)=>s+x*x,0);
 if(length2>1e-16&&valid){const v=candidates.at(-1);const t=v.reduce((s,x,i)=>s+(x-A[i])*delta[i],0)/length2;if(t<-.01||t>1.01)candidates.pop()}
 let best=mid,score=Infinity;
 for(const p of candidates){const e=error(q,p);if(Number.isFinite(e)&&e<score){score=e;best=p}}
 return {position:best,score};
}
function normalsOkay(faces,p,a,b,next,incidents){
 const affected=new Set([...incidents[a],...incidents[b]]);
 for(const fi of affected){const f=faces[fi];
  const updated=f.map(i=>i===b?a:i);
  if(new Set(updated).size!==3)continue;
  const triangle=ids=>ids.map(id=>id===a||id===b?next:p.slice(id*3,id*3+3));
  const area=verts=>{
   const [A,B,C]=verts,u=B.map((v,i)=>v-A[i]),v=C.map((v,i)=>v-A[i]);
   return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  };
  const old=area(f.map(id=>p.slice(id*3,id*3+3))),fresh=area(triangle(updated));
  const oo=Math.hypot(...old),nn=Math.hypot(...fresh);
  if(nn<oo*.05||nn<1e-12||fresh.reduce((s,x,i)=>s+x*old[i],0)/(oo*nn)<.25)return false;
 }
 return true;
}
export function decimateQEM(input,{targetRatio=.7,maxFaces=12000,maxPasses=16}={}){
 if(!(targetRatio>=.25&&targetRatio<=.9))throw Error('Цель QEM должна составлять от 25% до 90% граней');
 const cleaned=prepareMesh(input,{pruneSmall:false});
 if(cleaned.quality.nonManifoldEdges||cleaned.quality.windingConflicts)throw Error('Сначала устраните неманифолдные рёбра и нарушения ориентации');
 if(cleaned.quality.triangles>maxFaces)throw Error('QEM ограничен '+maxFaces.toLocaleString('ru-RU')+' гранями. Сначала примените обычное упрощение.');
 let p=Array.from(cleaned.positions),colors=Array.from(cleaned.colors),faces=Array.from({length:cleaned.indices.length/3},(_,i)=>[...cleaned.indices.slice(i*3,i*3+3)]);
 const initial=faces.length,target=Math.max(4,Math.ceil(initial*targetRatio));let collapses=0,passes=0;
 for(let pass=0;pass<maxPasses&&faces.length>target;pass++){
  const incidence=new Map(),neighbors=Array.from({length:p.length/3},()=>new Set()),incidentFaces=Array.from({length:p.length/3},()=>[]),boundary=new Set();
  for(let fi=0;fi<faces.length;fi++)for(const v of faces[fi])incidentFaces[v].push(fi);
  for(let fi=0;fi<faces.length;fi++)for(const [a,b] of [[faces[fi][0],faces[fi][1]],[faces[fi][1],faces[fi][2]],[faces[fi][2],faces[fi][0]]]){
   neighbors[a].add(b);neighbors[b].add(a);
   const k=edgeKey(a,b),v=incidence.get(k)||[];v.push(fi);incidence.set(k,v);
  }
  for(const [k,indices] of incidence)if(indices.length===1){const [a,b]=k.split(':').map(Number);boundary.add(a);boundary.add(b)}
  const q=quadrics(p,faces),candidates=[];
  for(const [k,list] of incidence){
   if(list.length!==2)continue;
   const [a,b]=k.split(':').map(Number);if(boundary.has(a)||boundary.has(b))continue;
   const shared=[...neighbors[a]].filter(x=>neighbors[b].has(x));
   const opposite=new Set(list.map(fi=>faces[fi].find(id=>id!==a&&id!==b)));
   if(shared.length!==2||opposite.size!==2||!shared.every(id=>opposite.has(id)))continue; // manifold link condition
   const sum=q[a].map((v,i)=>v+q[b][i]),A=p.slice(a*3,a*3+3),B=p.slice(b*3,b*3+3),choice=optimum(sum,A,B);
   if(normalsOkay(faces,p,a,b,choice.position,incidentFaces))candidates.push({a,b,...choice});
  }
  candidates.sort((a,b)=>a.score-b.score);
  const protectedVertices=new Set(),selected=[],remaining=faces.length-target;
  for(const candidate of candidates){
   if(selected.length*2>=remaining)break;
   if(protectedVertices.has(candidate.a)||protectedVertices.has(candidate.b))continue;
   selected.push(candidate);
   for(const id of [candidate.a,candidate.b,...neighbors[candidate.a],...neighbors[candidate.b]])protectedVertices.add(id);
  }
  if(!selected.length)break;
  const mapping=new Map(),lastP=p.slice(),lastC=colors.slice(),lastFaces=faces;
  for(const {a,b,position} of selected){
    mapping.set(b,a);for(let j=0;j<3;j++){
      lastP[a*3+j]=position[j];
      lastC[a*3+j]=(colors[a*3+j]+colors[b*3+j])*.5;
    }
  }
  const revised=[];
  for(const f of faces){
   const ids=f.map(id=>mapping.get(id)??id);
   if(new Set(ids).size===3)revised.push(ids);
  }
  // Sanitize and audit after simultaneous disjoint one-ring collapses.
  let clean;
  try{clean=prepareMesh({positions:Float32Array.from(lastP),colors:Float32Array.from(lastC),indices:Uint32Array.from(revised.flat())},{pruneSmall:false})}catch{break}
  if(clean.quality.nonManifoldEdges>cleaned.quality.nonManifoldEdges||clean.quality.windingConflicts>cleaned.quality.windingConflicts||clean.quality.boundaryEdges>cleaned.quality.boundaryEdges||clean.quality.triangles>=faces.length)break;
  p=Array.from(clean.positions);colors=Array.from(clean.colors);
  faces=Array.from({length:clean.indices.length/3},(_,i)=>[...clean.indices.slice(i*3,i*3+3)]);
  collapses+=selected.length;passes++;
 }
 if(faces.length>=initial)throw Error('Нет безопасных внутренних рёбер для QEM. Границы и топология сохранены; используйте другое упрощение.');
 const result=prepareMesh({positions:Float32Array.from(p),colors:Float32Array.from(colors),indices:Uint32Array.from(faces.flat())},{pruneSmall:false});
 return {...result,operation:{method:'qem-edge-collapse',sourceTriangles:initial,triangles:result.quality.triangles,targetTriangles:target,passes,collapses,limitReached:result.quality.triangles>target,boundaryProtected:true}};
}
