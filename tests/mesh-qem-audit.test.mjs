import test from 'node:test';
import assert from 'node:assert/strict';
import {decimateQEM} from '../src/mesh-qem.js';
import {auditMesh} from '../src/mesh-audit.js';
const source=(p,f)=>({positions:Float32Array.from(p),colors:new Float32Array(p.length).fill(.65),indices:Uint32Array.from(f)});
function grid(n=24){
 const p=[],f=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++)p.push(x/(n-1),y/(n-1),.02*Math.sin(x/6));
 for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){const i=y*n+x;f.push(i,i+1,i+n+1,i,i+n+1,i+n)}
 return source(p,f);
}
test('QEM reduces a grid and protects existing boundary topology',()=>{
 const g=grid(),before=auditMesh(g),copy=g.positions.slice(),q=decimateQEM(g,{targetRatio:.7});
 assert.ok(q.operation.passes>=1);
 assert.ok(q.operation.collapses>0);
 assert.ok(q.operation.triangles<q.operation.sourceTriangles);
 assert.equal(q.quality.boundaryEdges,before.quality.boundaryEdges);
 assert.equal(q.quality.nonManifoldEdges,0);assert.equal(q.quality.windingConflicts,0);
 assert.equal(q.positions.length,q.colors.length);
 assert.ok(q.indices.every(v=>v<q.positions.length/3));
 assert.deepEqual(g.positions,copy);
 assert.equal(q.quality.printReady,false);
});
test('QEM refuses unsafe target or mesh without collapsible internal manifold edges',()=>{
 assert.throws(()=>decimateQEM(grid(),{targetRatio:.1}),/25%/);
 const triangle=source([0,0,0,1,0,0,0,1,0],[0,1,2]);
 assert.throws(()=>decimateQEM(triangle,{targetRatio:.7}),/Нет безопасных/);
});
test('audit separates detected intersections, completed no-hit, and bounded incomplete runs',()=>{
 const crossed=source([0,0,0,1,0,0,0,1,0,.25,.25,-1,.25,.25,1,.75,.25,0],[0,1,2,3,4,5]);
 const hit=auditMesh(crossed);
 assert.equal(hit.intersection.status,'found');assert.ok(hit.intersection.countAtLeast>=1);
 assert.equal(hit.printReady,false);assert.equal(hit.selfIntersectionsCertified,false);
 const out=auditMesh(crossed,{maxFaces:1});
 assert.equal(out.intersection.status,'incomplete');assert.equal(out.intersection.complete,false);
 const separate=source([0,0,0,1,0,0,0,1,0,5,0,0,6,0,0,5,1,0],[0,1,2,3,4,5]);
 assert.equal(auditMesh(separate).intersection.status,'clear');
});
test('signed volume requires closed single shell, and physical wall thickness is not fabricated',()=>{
 const tet=source([0,0,0,1,0,0,0,1,0,0,0,1],[0,2,1,0,1,3,0,3,2,1,2,3]);
 const a=auditMesh(tet);assert.equal(a.quality.topologicallyClosed,true);
 assert.ok(Math.abs(a.signedVolume-1/6)<1e-8);
 assert.equal(a.wallThickness.status,'not-measured');
 assert.equal(a.printReady,false);assert.match(a.scale,/arbitrary/);
 const open=source([0,0,0,1,0,0,0,1,0],[0,1,2]);
 assert.equal(auditMesh(open).signedVolume,null);
});
