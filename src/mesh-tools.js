// Bounded, dependency-free mesh tools for a single indexed colour mesh.
// Vertex clustering is an approximation, NOT QEM decimation; UV/rigged or
// multi-material assets must not be routed here.
import {prepareMesh} from './mesh-quality.js';
const key=(a,b)=>a<b?a+':'+b:b+':'+a;
function validate(input){
 const {positions,indices,colors}=input||{};
 if(!positions||!indices||!colors||positions.length%3||indices.length%3||
    positions.length!==colors.length||positions.length<9||indices.length<3||
    positions.length>1500000||indices.length>1200000)throw Error('Нужна одна индексированная сетка с RGB-цветами (до 500 тыс. вершин и 400 тыс. граней)');
 return {positions,indices,colors};
}
export function simplifyMesh(input,{cellRatio=.01}={}){
 const {positions,indices,colors}=validate(input);
 if(!(cellRatio>=.002&&cellRatio<=.08))throw Error('Размер ячейки должен быть от 0,2% до 8% диагонали');
 const n=positions.length/3,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<positions.length;i++){if(!Number.isFinite(positions[i])||!Number.isFinite(colors[i]))throw Error('Обнаружены некорректные данные вершин');let j=i%3;lo[j]=Math.min(lo[j],positions[i]);hi[j]=Math.max(hi[j],positions[i])}
 const diagonal=Math.hypot(...lo.map((v,i)=>hi[i]-v));if(!(diagonal>1e-9))throw Error('Нулевые размеры Mesh');
 const size=diagonal*cellRatio,map=new Map(),clusters=[],remap=new Uint32Array(n);
 for(let i=0;i<n;i++){
  const at=i*3,k=[0,1,2].map(j=>Math.floor((positions[at+j]-lo[j])/size)).join(':');
  let id=map.get(k);
  if(id===undefined){id=clusters.length;clusters.push({p:[0,0,0],c:[0,0,0],n:0});map.set(k,id)}
  remap[i]=id;const bucket=clusters[id];bucket.n++;
  for(let j=0;j<3;j++){bucket.p[j]+=positions[at+j];bucket.c[j]+=colors[at+j]}
 }
 const p=new Float32Array(clusters.length*3),c=new Float32Array(p.length);
 for(let i=0;i<clusters.length;i++)for(let j=0;j<3;j++){
  p[i*3+j]=clusters[i].p[j]/clusters[i].n;
  c[i*3+j]=Math.max(0,Math.min(1,clusters[i].c[j]/clusters[i].n));
 }
 const out=new Uint32Array(indices.length);
 for(let i=0;i<indices.length;i++){if(indices[i]>=n)throw Error('Индекс вне Mesh');out[i]=remap[indices[i]]}
 const cleaned=prepareMesh({positions:p,colors:c,indices:out},{pruneSmall:false});
 if(cleaned.quality.triangles<4)throw Error('Слишком сильное упрощение: осталось менее четырёх граней');
 if(cleaned.quality.triangles>=indices.length/3)throw Error('Сетка не стала проще. Выберите больший размер ячейки.');
 return {...cleaned,operation:{method:'vertex-clustering',cellRatio,sourceVertices:n,sourceTriangles:indices.length/3,vertices:cleaned.quality.vertices,triangles:cleaned.quality.triangles,collapsedFaces:cleaned.quality.removedDegenerate}};
}
export function orientMesh(input){
 const {positions,colors,indices}=validate(input);
 // Normalize invalid/duplicate faces without dropping legitimate disconnected parts.
 const clean=prepareMesh({positions,colors,indices},{pruneSmall:false});
 const faces=Array.from({length:clean.indices.length/3},(_,i)=>[clean.indices[i*3],clean.indices[i*3+1],clean.indices[i*3+2]]);
 const incidence=new Map();
 for(let i=0;i<faces.length;i++)for(const [a,b] of [[faces[i][0],faces[i][1]],[faces[i][1],faces[i][2]],[faces[i][2],faces[i][0]]]){
  const k=key(a,b),arr=incidence.get(k)||[];arr.push({face:i,sign:a<b?1:-1});incidence.set(k,arr);
 }
 const graph=Array.from({length:faces.length},()=>[]);let nonManifold=0;
 for(const arr of incidence.values()){
  if(arr.length>2){nonManifold++;continue}
  if(arr.length===2){const [a,b]=arr,opposite=a.sign===b.sign?1:0;graph[a.face].push([b.face,opposite]);graph[b.face].push([a.face,opposite])}
 }
 const flip=new Int8Array(faces.length).fill(-1),components=[];let conflicts=0;
 for(let i=0;i<faces.length;i++){
  if(flip[i]!==-1)continue;
  flip[i]=0;const stack=[i],group=[];
  while(stack.length){
   const f=stack.pop();group.push(f);
   for(const [other,xor] of graph[f]){
    const expected=flip[f]^xor;
    if(flip[other]===-1){flip[other]=expected;stack.push(other)}
    else if(flip[other]!==expected)conflicts++;
   }
  }
  components.push(group);
 }
 if(conflicts||nonManifold)throw Error('Автоматический ремонт не выполняется при конфликтной или неманифолдной топологии ('+nonManifold+' неманифолдных рёбер, '+conflicts+' конфликтов).');
 for(let i=0;i<faces.length;i++)if(flip[i]) [faces[i][1],faces[i][2]]=[faces[i][2],faces[i][1]];
 // Closed connected components have a meaningful global orientation.
 const groupOf=new Int32Array(faces.length);components.forEach((g,i)=>g.forEach(f=>groupOf[f]=i));
 const closed=components.map(()=>true);
 for(const arr of incidence.values())if(arr.length===1)closed[groupOf[arr[0].face]]=false;
 const globallyFlipped=[];
 for(let ci=0;ci<components.length;ci++){
  if(!closed[ci])continue;
  const group=components[ci],first=faces[group[0]][0],origin=clean.positions.slice(first*3,first*3+3);
  let volume6=0;
  for(const fi of group){
   const [a,b,c]=faces[fi].map(id=>[0,1,2].map(j=>clean.positions[id*3+j]-origin[j]));
   volume6+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);
  }
  if(volume6 < -1e-12){for(const fi of group)[faces[fi][1],faces[fi][2]]=[faces[fi][2],faces[fi][1]];globallyFlipped.push(ci)}
 }
 const final=prepareMesh({...clean,indices:Uint32Array.from(faces.flat())},{pruneSmall:false});
 return {...final,operation:{method:'consistent-winding',components:components.length,closedComponents:closed.filter(Boolean).length,globalFlips:globallyFlipped.length,flippedFaces:flip.filter(Boolean).length,sourceTriangles:indices.length/3,triangles:final.quality.triangles}};
}
