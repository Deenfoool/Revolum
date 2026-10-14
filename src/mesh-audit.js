// A bounded mesh audit. It is NOT a print certification or exhaustive CAD check.
// Reject unbounded pair searches: "incomplete" must never be presented as clear.
import {prepareMesh} from './mesh-quality.js';
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function segmentTriangle(from,to,T,eps){
 const d=sub(to,from),e1=sub(T[1],T[0]),e2=sub(T[2],T[0]),p=cross(d,e2),det=dot(e1,p);
 if(Math.abs(det)<eps*eps*eps)return false;
 const inv=1/det,t=sub(from,T[0]),u=dot(t,p)*inv;
 if(u<1e-9||u>1-1e-9)return false;
 const q=cross(t,e1),v=dot(d,q)*inv;
 if(v<1e-9||u+v>1-1e-9)return false;
 const distance=dot(e2,q)*inv;
 return distance>1e-9&&distance<1-1e-9;
}
const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function overlap2D(A,B,eps){
 const inside=(p,T)=>{
   const signs=[orient(T[0],T[1],p),orient(T[1],T[2],p),orient(T[2],T[0],p)];
   return signs.every(v=>v>eps)||signs.every(v=>v< -eps);
 };
 if(A.some(p=>inside(p,B))||B.some(p=>inside(p,A)))return true;
 for(let i=0;i<3;i++)for(let j=0;j<3;j++){
  const a=A[i],b=A[(i+1)%3],c=B[j],d=B[(j+1)%3];
  const x=orient(a,b,c),y=orient(a,b,d),z=orient(c,d,a),w=orient(c,d,b);
  if(x*y < -eps*eps&&z*w < -eps*eps)return true;
 }
 return false;
}
function overlap(A,B,eps){
 const na=cross(sub(A[1],A[0]),sub(A[2],A[0])),nb=cross(sub(B[1],B[0]),sub(B[2],B[0]));
 const normA=Math.hypot(...na),normB=Math.hypot(...nb);
 if(normA<eps*eps||normB<eps*eps)return false;
 const nd=dot(na,nb)/(normA*normB);
 if(Math.abs(nd)>1-1e-7&&B.every(p=>Math.abs(dot(na,sub(p,A[0])))/normA<eps)){
  const axis=[0,1,2].sort((i,j)=>Math.abs(na[j])-Math.abs(na[i]))[0],keep=[0,1,2].filter(x=>x!==axis);
  return overlap2D(A.map(p=>keep.map(i=>p[i])),B.map(p=>keep.map(i=>p[i])),eps*eps);
 }
 for(let i=0;i<3;i++){
  if(segmentTriangle(A[i],A[(i+1)%3],B,eps))return true;
  if(segmentTriangle(B[i],B[(i+1)%3],A,eps))return true;
 }
 return false;
}
export function auditMesh(input,{maxFaces=12000,maxComparisons=1800000,maxHits=64}={}){
 const mesh=prepareMesh(input,{pruneSmall:false}),{positions,indices,quality}=mesh;
 const faces=indices.length/3,n=positions.length/3;
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<positions.length;i++){const j=i%3;lo[j]=Math.min(lo[j],positions[i]);hi[j]=Math.max(hi[j],positions[i])}
 const size=hi.map((v,i)=>v-lo[i]),diagonal=Math.hypot(...size),eps=Math.max(1e-12,diagonal*1e-8);
 let comparisons=0,hits=0,possible=0,skippedAdjacent=0,complete=faces<=maxFaces;
 let data=[];
 if(complete)data=Array.from({length:faces},(_,i)=>{
  const ids=Array.from(indices.slice(i*3,i*3+3)),verts=ids.map(id=>Array.from(positions.slice(id*3,id*3+3)));
  return {id:i,ids,verts,min:[0,1,2].map(j=>Math.min(...verts.map(p=>p[j]))),max:[0,1,2].map(j=>Math.max(...verts.map(p=>p[j])))};
 });
 const samples=[];
 if(complete){
  data.sort((a,b)=>a.min[0]-b.min[0]);
  outer:for(let i=0;i<faces;i++)for(let j=i+1;j<faces;j++){
   const a=data[i],b=data[j];if(b.min[0]>a.max[0]+eps)break;
   if(b.min[1]>a.max[1]+eps||a.min[1]>b.max[1]+eps||b.min[2]>a.max[2]+eps||a.min[2]>b.max[2]+eps)continue;
   if(a.ids.some(id=>b.ids.includes(id))){skippedAdjacent++;continue} // shared vertices need a specialized contact analysis
   possible++;if(comparisons>=maxComparisons){complete=false;break outer}
   comparisons++;
   if(overlap(a.verts,b.verts,eps)){hits++;if(samples.length<12)samples.push([a.id,b.id]);if(hits>=maxHits){complete=false;break outer}}
  }
 }
 const status=hits?'found':complete?'clear':'incomplete';
 const canVolume=quality.topologicallyClosed&&quality.fragmentsAfter===1;
 let signedVolume=null;
 if(canVolume){
  let volume6=0;
  for(let i=0;i<indices.length;i+=3){
   const tri=[indices[i],indices[i+1],indices[i+2]].map(id=>Array.from(positions.slice(id*3,id*3+3)));
   const [a,b,c]=tri.map(p=>sub(p,lo));volume6+=dot(a,cross(b,c));
  }
  signedVolume=volume6/6;
 }
 return {
  format:'revolum-mesh-audit',version:1,
  triangles:faces,vertices:n,scale:'arbitrary / no physical units',
  boundingBox:{min:lo,max:hi,size,diagonal},
  quality,
  intersection:{status,complete,countAtLeast:hits,candidatePairs:possible,testedPairs:comparisons,
   skippedSharedVertexPairs:skippedAdjacent,examples:samples,
   limitations:'Shared-vertex contacts and tangencies are excluded; near-coplanar and numerically degenerate cases require specialist CAD validation.'},
  signedVolume:canVolume?signedVolume:null,
  volumeUnit:canVolume?'arbitrary cubed':'unavailable: not closed/consistent',
  wallThickness:{status:'not-measured',minimum:null},
  selfIntersectionsCertified:false,printReady:false,
  blockers:[
    ...(!quality.topologicallyClosed?['Топология не замкнута или имеет конфликты']:[]),
    ...(status==='found'?['Обнаружены потенциальные самопересечения']:status==='incomplete'?['Аудит пересечений не завершён']:[]),
    'Не задана физическая шкала','Минимальная толщина стенок не измерена',
    'Самопересечения и касания не сертифицированы CAD-проверкой'
  ]
 };
}
