import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareMesh} from '../src/mesh-quality.js';
const mesh=(p,f)=>({positions:Float32Array.from(p),colors:new Float32Array(p.length).fill(.6),indices:Uint32Array.from(f)});
test('closed consistently wound tetrahedron has zero boundary edges but is not certified print-ready',()=>{
 const m=mesh([0,0,0,1,0,0,0,1,0,0,0,1],[0,2,1,0,1,3,0,3,2,1,2,3]);
 const result=prepareMesh(m);
 assert.equal(result.quality.boundaryEdges,0);
 assert.equal(result.quality.nonManifoldEdges,0);
 assert.equal(result.quality.windingConflicts,0);
 assert.equal(result.quality.topologicallyClosed,true);
 assert.equal(result.quality.printReady,false);
 assert.equal(result.quality.fragmentsAfter,1);
});
test('open square detects four boundary edges and remains explicitly unprintable',()=>{
 const m=mesh([0,0,0,1,0,0,1,1,0,0,1,0],[0,1,2,0,2,3]);
 const q=prepareMesh(m).quality;
 assert.equal(q.boundaryEdges,4);assert.equal(q.topologicallyClosed,false);assert.equal(q.printReady,false);
});
test('duplicated and zero-area faces are removed without creating new geometry',()=>{
 const m=mesh([0,0,0,1,0,0,1,1,0,0,1,0],[0,1,2,0,2,1,0,2,3,0,0,1]);
 const q=prepareMesh(m).quality;
 assert.equal(q.removedDuplicates,1);assert.equal(q.removedDegenerate,1);assert.equal(q.triangles,2);
});
test('optional fragment pruning removes small disconnected dust and compacts vertices',()=>{
 const p=[],f=[],N=5;
 for(let y=0;y<N;y++)for(let x=0;x<N;x++)p.push(x,y,0);
 for(let y=0;y<N-1;y++)for(let x=0;x<N-1;x++){
  const a=y*N+x,b=a+1,c=a+N,d=c+1;f.push(a,b,d,a,d,c);
 }
 const dust=p.length/3;p.push(30,30,0,31,30,0,30,31,0);f.push(dust,dust+1,dust+2);
 const m=mesh(p,f),clean=prepareMesh(m),untouched=prepareMesh(m,{pruneSmall:false});
 assert.equal(clean.quality.fragmentsBefore,2);
 assert.equal(clean.quality.fragmentsAfter,1);
 assert.equal(clean.quality.removedFragments,1);
 assert.equal(clean.quality.removedFragmentTriangles,1);
 assert.equal(clean.quality.triangles,32);
 assert.equal(clean.positions.length/3,25);
 assert.equal(untouched.quality.fragmentsAfter,2);
 assert.equal(untouched.indices.length/3,33);
});
test('non-manifold shared edge is reported rather than repaired or certified',()=>{
 const m=mesh([0,0,0,1,0,0,0,1,0,0,-1,0,0,0,1],[0,1,2,1,0,3,0,1,4]);
 const q=prepareMesh(m,{pruneSmall:false}).quality;
 assert.equal(q.nonManifoldEdges,1);assert.equal(q.topologicallyClosed,false);
});
test('invalid input and indices are rejected',()=>{
 const m=mesh([0,0,0,1,0,0,0,1,0],[0,1,9]);
 assert.throws(()=>prepareMesh(m),/Индекс/);
 assert.throws(()=>prepareMesh(mesh([0,0,0,1,0,0,0,1,NaN],[0,1,2])),/Нечисловые/);
 assert.throws(()=>prepareMesh(mesh([0,0,0,1,0,0,0,1,0],[0,1,2]),{fragmentRatio:.5}),/порог/);
});
