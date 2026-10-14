import test from 'node:test';
import assert from 'node:assert/strict';
import {selectVoxelPoints,encodeCloudPly} from '../src/pointcloud.js';
const positions=Float32Array.from([0,0,0,.001,0,0,1,0,0,1.001,0,0,0,1,0,0,1.001,0]);
test('voxel downsample preserves one real original position per occupied cell',()=>{
 const r=selectVoxelPoints(positions,{fraction:.025});
 assert.equal(r.sourceCount,6);assert.equal(r.remaining,3);
 assert.deepEqual([...r.indices],[0,2,4]);
 assert.ok(r.voxelSize>0);
});
test('PLY encodes the retained coordinates and RGB with stable binary layout',async()=>{
 const ids=Uint32Array.from([0,2,4]);
 const rgb=Float32Array.from([1,0,0,1,1,1,0,.5,1,0,0,1,.25,.5,.75,1,1,0]);
 const blob=encodeCloudPly(positions,ids,rgb);
 const text=await blob.slice(0,300).text(),headerSize=new TextEncoder().encode(text.slice(0,text.indexOf('end_header\n')+'end_header\n'.length)).length;
 assert.match(text,/format binary_little_endian 1.0/);
 assert.match(text,/element vertex 3/);
 assert.equal(blob.size,headerSize+3*15);
 const dv=new DataView(await blob.arrayBuffer());assert.equal(dv.getFloat32(headerSize,true),0);
 assert.equal(dv.getUint8(headerSize+12),255);assert.equal(dv.getUint8(headerSize+13),0);
 assert.equal(dv.getFloat32(headerSize+15,true),1);
});
test('invalid and unbounded inputs fail explicitly',()=>{
 assert.throws(()=>selectVoxelPoints(Float32Array.from([1,2,3])),/достаточно/);
 assert.throws(()=>selectVoxelPoints(positions,{fraction:0}),/размер/);
 assert.throws(()=>selectVoxelPoints(positions,{maxPoints:2}),/слишком велико/);
 assert.throws(()=>selectVoxelPoints(Float32Array.from([0,0,0,NaN,0,0])),/недопустимые/);
 assert.throws(()=>encodeCloudPly(positions,Uint32Array.from([100])),/индекс/);
});
