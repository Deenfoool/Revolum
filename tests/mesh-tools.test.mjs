import test from 'node:test';
import assert from 'node:assert/strict';
import {simplifyMesh,orientMesh} from '../src/mesh-tools.js';
import {prepareMesh} from '../src/mesh-quality.js';
const input=(positions,indices)=>({positions:Float32Array.from(positions),colors:new Float32Array(positions.length).fill(.65),indices:Uint32Array.from(indices)});
test('vertex clustering reduces a dense open scan and preserves bounded colors and valid indices',()=>{
 const n=40,p=[],faces=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++)p.push(x/(n-1),y/(n-1),.03*Math.sin(x/6));
 for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){
  const a=y*n+x,b=a+1,c=a+n,d=c+1;faces.push(a,b,d,a,d,c);
 }
 const source=input(p,faces),original=source.positions.slice();
 const r=simplifyMesh(source,{cellRatio:.02});
 assert.ok(r.positions.length<source.positions.length);
 assert.ok(r.indices.length<source.indices.length);
 assert.equal(r.colors.length,r.positions.length);
 assert.ok(r.indices.every(i=>i<r.positions.length/3));
 assert.ok(r.colors.every(v=>v>=0&&v<=1));
 assert.deepEqual(source.positions,original);
 assert.equal(r.operation.sourceTriangles,faces.length/3);
 assert.equal(r.quality.printReady,false);
 assert.ok(r.quality.boundaryEdges>0);
 assert.throws(()=>simplifyMesh(source,{cellRatio:.00001}),/Размер ячейки/);
});
test('consistent winding repairs reversed adjacent triangles on an open surface',()=>{
 const plane=input([0,0,0,1,0,0,1,1,0,0,1,0],[0,1,2,0,3,2]);
 const before=prepareMesh(plane,{pruneSmall:false});assert.equal(before.quality.windingConflicts,1);
 const result=orientMesh(plane);
 assert.equal(result.quality.windingConflicts,0);
 assert.equal(result.quality.boundaryEdges,4);
 assert.equal(result.operation.flippedFaces,1);
 assert.equal(result.quality.printReady,false);
});
test('inverted closed tetrahedron is consistently oriented and outward by signed volume',()=>{
 const solid=input([0,0,0,1,0,0,0,1,0,0,0,1],[0,1,2,0,3,1,0,2,3,1,3,2]);
 const r=orientMesh(solid);
 assert.equal(r.operation.globalFlips,1);
 assert.equal(r.quality.boundaryEdges,0);
 assert.equal(r.quality.windingConflicts,0);
 assert.equal(r.quality.topologicallyClosed,true);
 assert.equal(r.quality.printReady,false);
});
test('non-manifold edge refuses automatic normal repair rather than silently inventing topology',()=>{
 const bad=input([0,0,0,1,0,0,0,1,0,0,-1,0,0,0,1],[0,1,2,1,0,3,0,1,4]);
 assert.throws(()=>orientMesh(bad),/неманифолдных/);
});
test('rejects invalid geometry and overly strong simplification',()=>{
 assert.throws(()=>orientMesh(input([0,0,0,1,0,0,0,1,0],[0,1,9])),/Индекс/);
 const tetra=input([0,0,0,1,0,0,0,1,0,0,0,1],[0,2,1,0,1,3,0,3,2,1,2,3]);
 assert.throws(()=>simplifyMesh(tetra,{cellRatio:.08}),/Сетка не стала проще|Слишком сильное упрощение/);
});
