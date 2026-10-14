import test from 'node:test';
import assert from 'node:assert/strict';
import {depthGrid,percentileRange,bilinear} from '../src/depth-grid.js';
test('builds an actual triangulated depth surface with image UVs',()=>{
  const depth=new Float32Array(16*12);
  for(let y=0;y<12;y++)for(let x=0;x<16;x++)depth[y*16+x]=x/16+y/12;
  const grid=depthGrid({depth,width:16,height:12,imageWidth:1600,imageHeight:1200,columns:32});
  assert.equal(grid.columns,32);
  assert.equal(grid.rows,24);
  assert.equal(grid.positions.length,(33*25)*3);
  assert.equal(grid.uv.length,33*25*2);
  assert.ok(grid.indices.length>0);
  assert.equal(grid.indices.length%3,0);
  assert.equal(grid.uv[0],0);assert.equal(grid.uv[1],1);
  assert.ok(grid.positions.some(z=>z!==0));
  assert.ok([...grid.indices].every(i=>i>=0&&i<33*25));
});
test('depth quantile range trims outliers and interpolation is bounded',()=>{
 const source=Float32Array.from({length:100},(_,i)=>i);source[0]=-10000;source[99]=10000;
 const range=percentileRange(source);
 assert.ok(range.lo>-10000&&range.hi<10000);
 assert.equal(bilinear(new Float32Array([0,1,2,3]),2,2,.5,.5),1.5);
 assert.equal(bilinear(new Float32Array([0,1,2,3]),2,2,-1,999),2);
});
test('unusable depth maps fail instead of creating fabricated geometry',()=>{
 assert.throws(()=>depthGrid({depth:new Float32Array([1,1,1,1]),width:2,height:2,imageWidth:100,imageHeight:100}),/различима глубина/);
 assert.throws(()=>depthGrid({depth:new Float32Array([1,2]),width:2,height:2,imageWidth:100,imageHeight:100}),/Некорректная/);
});
