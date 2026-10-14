import test from 'node:test';
import assert from 'node:assert/strict';
import {planScanBudget,SCAN_PROFILES} from '../src/scan-budget.js';

const photos=(n,w=4000,h=3000)=>Array.from({length:n},()=>({width:w,height:h}));
test('small capture keeps the requested profile within GPU target budget',()=>{
 const r=planScanBudget(photos(8),{profile:'balanced',bindingLimit:128*1048576});
 assert.equal(r.trainMaxDim,960);assert.equal(r.frames,8);
 assert.equal(r.limited,false);assert.ok(r.packedMB<128*.54+2);
 assert.equal(r.featMaxDim,720);assert.equal(r.initTarget,18000);
});
test('large capture reduces decode/training dimensions without exceeding GPU binding',()=>{
 const r=planScanBudget(photos(120),{profile:'detail',bindingLimit:128*1048576});
 assert.ok(r.trainMaxDim<1280&&r.trainMaxDim>=224);
 assert.ok(r.packedMB<=Math.ceil(128*.54));
 assert.equal(r.limited,true);assert.match(r.warning,/снижено/);
 assert.ok(r.featMaxDim<=r.trainMaxDim);
});
test('360 equirectangular panoramas count as six square training faces each',()=>{
 const r=planScanBudget(photos(8,4096,2048),{profile:'detail',bindingLimit:128*1048576});
 assert.equal(r.panorama,true);assert.equal(r.frames,48);assert.ok(r.limited);
 assert.throws(()=>planScanBudget([...photos(7),...photos(1,4096,2048)]),/смешивать/);
});
test('rejects insufficient, unknown and impossible memory configurations',()=>{
 assert.throws(()=>planScanBudget(photos(7)),/от 8/);
 assert.throws(()=>planScanBudget(photos(121)),/от 8/);
 assert.throws(()=>planScanBudget([{width:0,height:0},...photos(7)]),/размеры/);
 assert.throws(()=>planScanBudget(photos(120),{bindingLimit:16*1048576}),/превышает/);
 assert.throws(()=>planScanBudget(photos(8),{profile:'nonexistent'}),/профиль/);
 assert.equal(Object.keys(SCAN_PROFILES).length,3);
});
