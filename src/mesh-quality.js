// Topology diagnostics and conservative cleanup for indexed triangle meshes.
// Operates solely on the generated geometry, without manufacturing missing surfaces.
const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function prepareMesh(mesh,{pruneSmall=true,fragmentRatio=.02}={}){
 const {positions,indices,colors}=mesh||{};
 if(!positions||!indices||!colors||positions.length%3||indices.length%3||colors.length!==positions.length||
    positions.length<9||indices.length<3||positions.length>1500000||indices.length>1200000)
   throw Error('Неверный формат полигонального Mesh');
 if(!(fragmentRatio>=0&&fragmentRatio<=.25))throw Error('Некорректный порог удаления фрагментов');
 const n=positions.length/3,faceCount=indices.length/3;
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<positions.length;i++){
   if(!Number.isFinite(positions[i])||!Number.isFinite(colors[i]))throw Error('Нечисловые координаты или цвета Mesh');
   const axis=i%3;lo[axis]=Math.min(lo[axis],positions[i]);hi[axis]=Math.max(hi[axis],positions[i]);
 }
 const diagonal=Math.hypot(...lo.map((v,i)=>hi[i]-v));
 if(!(diagonal>1e-12))throw Error('Mesh вырожден: нулевой размер');
 const areaFloor=Math.pow(diagonal,4)*1e-20;
 const valid=[],unique=new Set();let degenerate=0,duplicate=0;
 for(let fi=0;fi<faceCount;fi++){
  const a=indices[fi*3],b=indices[fi*3+1],c=indices[fi*3+2];
  if(!Number.isInteger(a)||!Number.isInteger(b)||!Number.isInteger(c)||a>=n||b>=n||c>=n)throw Error('Индекс грани выходит за границы Mesh');
  if(a===b||b===c||c===a){degenerate++;continue}
  const ax=positions[a*3],ay=positions[a*3+1],az=positions[a*3+2],
    ux=positions[b*3]-ax,uy=positions[b*3+1]-ay,uz=positions[b*3+2]-az,
    vx=positions[c*3]-ax,vy=positions[c*3+1]-ay,vz=positions[c*3+2]-az,
    cx=uy*vz-uz*vy,cy=uz*vx-ux*vz,cz=ux*vy-uy*vx;
  if(cx*cx+cy*cy+cz*cz<=areaFloor){degenerate++;continue}
  const key=[a,b,c].sort((x,y)=>x-y).join(':');
  if(unique.has(key)){duplicate++;continue}unique.add(key);valid.push([a,b,c]);
 }
 if(!valid.length)throw Error('После проверки не осталось допустимых треугольников');
 const parent=Int32Array.from({length:valid.length},(_,i)=>i);
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i};
 const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a};
 // Each shared edge holds its first incident face and oriented use.
 const edges=new Map();
 valid.forEach(([a,b,c],fi)=>{
   for(const [u,v] of [[a,b],[b,c],[c,a]]){
     const key=edgeKey(u,v),ent=edges.get(key);
     if(ent){join(fi,ent.first);ent.count++;if(ent.sign===(u<v?1:-1))ent.winding=true}
     else edges.set(key,{first:fi,count:1,sign:u<v?1:-1,winding:false});
   }
 });
 const groups=new Map();
 for(let fi=0;fi<valid.length;fi++){const id=find(fi);groups.set(id,(groups.get(id)||0)+1)}
 const sorted=[...groups.entries()].sort((a,b)=>b[1]-a[1]);const largest=sorted[0][1];
 const threshold=pruneSmall?Math.max(8,Math.ceil(largest*fragmentRatio)):0;
 const keep=new Set(sorted.filter(([id,count],i)=>!pruneSmall||i===0||count>=threshold).map(x=>x[0]));
 const retained=valid.filter((_,fi)=>keep.has(find(fi))),discarded=valid.length-retained.length;
 if(retained.length<1)throw Error('Нечего сохранять после очистки компонентов');
 const remap=new Map(),p=[],col=[],out=[];
 for(const face of retained){
   for(const index of face){
     if(!remap.has(index)){
       const j=p.length/3;remap.set(index,j);
       for(let k=0;k<3;k++){p.push(positions[index*3+k]);col.push(clamp(colors[index*3+k],0,1))}
     }
     out.push(remap.get(index));
   }
 }
 // Re-evaluate topology AFTER pruning. Open surfaces are not printable meshes.
 const edgeStats=new Map();
 for(let i=0;i<out.length;i+=3){
   const a=out[i],b=out[i+1],c=out[i+2];
   for(const [u,v] of [[a,b],[b,c],[c,a]]){
     const key=edgeKey(u,v),sign=u<v?1:-1;
     const ent=edgeStats.get(key);
     if(ent){ent.count++;if(ent.sign===sign)ent.sameOrientation=true}
     else edgeStats.set(key,{count:1,sign,sameOrientation:false});
   }
 }
 let boundary=0,nonManifold=0,winding=0;
 for(const e of edgeStats.values()){
   if(e.count===1)boundary++;
   if(e.count>2)nonManifold++;
   if(e.sameOrientation)winding++;
 }
 const keptComponents=sorted.filter(x=>keep.has(x[0])).length;
 const topologicallyClosed=boundary===0&&nonManifold===0&&winding===0&&keptComponents===1;
 return {
   positions:Float32Array.from(p),colors:Float32Array.from(col),indices:Uint32Array.from(out),
   quality:{
     sourceTriangles:faceCount,triangles:retained.length,vertices:p.length/3,
     removedDegenerate:degenerate,removedDuplicates:duplicate,
     fragmentsBefore:groups.size,fragmentsAfter:keptComponents,
     removedFragments:sorted.length-keptComponents,removedFragmentTriangles:discarded,
     boundaryEdges:boundary,nonManifoldEdges:nonManifold,windingConflicts:winding,
     topologicallyClosed,printReady:false,
     note:topologicallyClosed?'Топология замкнута, но самопересечения и физический масштаб НЕ проверены.': 'Сетка содержит открытые края/разрозненные участки или нарушения топологии; к печати не готова.'
   }
 };
}
