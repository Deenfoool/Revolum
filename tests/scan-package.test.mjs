import test from 'node:test';
import assert from 'node:assert/strict';
import {sfmDiagnostics,scanBundle,verifyGaussianPly} from '../src/scan-package.js';
import {validateCapture,sparsePly} from '../src/multiview.js';

const frames=Array.from({length:8},(_,i)=>({name:'image-'+(i+1)+'.jpg'}));
const recon={
 cams:[{imgIdx:0},{imgIdx:1},{imgIdx:2},{imgIdx:4},{imgIdx:5},{imgIdx:7}],
 points:Array.from({length:68},(_,i)=>({X:[i/10,0,1],rgb:[.2,.4,.6]})),rmsBA:1.2
};
test('SfM diagnostics name missing photos and do not invent metric scale',()=>{
 const r=sfmDiagnostics(recon,frames);
 assert.equal(r.registered,6);assert.equal(r.input,8);assert.equal(r.registrationRate,75);
 assert.equal(r.sparsePoints,68);assert.equal(r.quality,'partial');
 assert.deepEqual(r.unregistered.map(x=>x.index),[3,6]);
 assert.match(r.scale,/arbitrary/);assert.equal(r.rmsBA,1.2);
 assert.equal(sfmDiagnostics({cams:[],points:[]},[]).registrationRate,0);
});
test('capture validation and real sparse landmarks',()=>{
 const batch=Array.from({length:8},(_,i)=>({name:'frame-'+i+'.jpg',size:1024}));
 assert.equal(validateCapture(batch).count,8);
 assert.throws(()=>validateCapture(batch.slice(0,7)),/минимум 8/);
 const blob=sparsePly(recon);assert.ok(blob.size>200);
});
class FakeZip{
 constructor(){this.items=new Map()}
 file(name,value,opts){this.items.set(name,{value,opts});return this}
 async generateAsync(){return new Blob([JSON.stringify([...this.items].map(([name])=>name))])}
}
const validPly=new Blob(['ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty float x\nproperty float opacity\nproperty float scale_0\nend_header\n',new Uint8Array(256)]);
test('scan bundle validates Gaussian PLY and includes all portable results',async()=>{
 assert.equal(await verifyGaussianPly(validPly),true);
 await assert.rejects(verifyGaussianPly(new Blob([new Uint8Array(512)])),/Gaussian/);
 const out=await scanBundle({name:'Test scan',splat:validPly,cloud:new Blob(['cloud']),cameras:new Blob(['{}']),diagnostics:sfmDiagnostics(recon,frames),zipConstructor:FakeZip});
 assert.equal(out.filename,'Test-scan-scan.zip');assert.ok(out.blob.size>40);
 const names=JSON.parse(await out.blob.text());
 assert.deepEqual(names,['gaussian-splats.ply','sparse-cloud.ply','camera-poses.json','manifest.json','README.txt']);
});
