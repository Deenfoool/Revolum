import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraPoint,project,fitRelativeDepth,reconstructDense,encodeDensePly} from '../src/mvs-core.js';
function scene(){
 const points=[];
 for(let x=-10;x<=10;x++)for(let y=-10;y<=10;y++){const X=x*.045,Y=y*.045;points.push({X:[X,Y,3+.16*X]})}
 const positions=[[0,0,0],[.25,0,0],[-.25,0,0],[0,.22,0]];
 const views=positions.map(([x,y,z],k)=>{
  const cam={R:[1,0,0,0,1,0,0,0,1],t:[-x,-y,-z],f:90,cx:64,cy:48};
  const w=128,h=96,depth=new Float32Array(w*h);
  for(let v=0;v<h;v++)for(let u=0;u<w;u++){
   const rayx=(u-64)/90,X=(x+rayx*3)/(1-rayx*.16),Z=3+.16*X;
   depth[v*w+u]=(Z-(1.25+k*.1))/(k%2?-.32:.4);
  }
  const rgba=new Uint8Array(8*8*4);rgba.fill(190);
  return {cam,depth,width:w,height:h,fw:w,fh:h,name:'view-'+k,image:{width:8,height:8,data:rgba}};
 });
 return {points,views};
}
test('camera projection matches row-major Splat.js R/t conventions',()=>{
 const cam={R:[1,0,0,0,1,0,0,0,1],t:[-.25,0,0],f:90,cx:64,cy:48};
 assert.deepEqual(cameraPoint(cam,[.25,0,3]),[0,0,3]);
 assert.deepEqual(project(cam,[.25,0,3]),{u:64,v:48,z:3});
 assert.equal(project(cam,[0,0,-1]),null);
});
test('depth calibration handles independent positive and inverted relative-depth scales',()=>{
 const {points,views}=scene();
 for(const v of views){
  const fit=fitRelativeDepth(v.cam,v,points);
  assert.ok(fit.inliers>100);
  assert.ok(fit.medianError<.015);
 }
 assert.ok(fitRelativeDepth(views[0].cam,views[0],points).a>0);
 assert.ok(fitRelativeDepth(views[1].cam,views[1],points).a<0);
});
test('four aligned viewpoints fuse into one indexed 3D surface',()=>{
 const result=reconstructDense(scene(),{resolution:40});
 assert.equal(result.stats.calibrated,4);
 assert.equal(result.stats.skipped.length,0);
 assert.ok(result.stats.vertices>1000);
 assert.ok(result.stats.triangles>1000);
 assert.equal(result.positions.length,result.colors.length);
 assert.equal(result.indices.length,result.stats.triangles*3);
 assert.ok(result.indices.every(i=>i<result.stats.vertices));
 assert.equal(result.stats.watertight,false);
 assert.ok(Math.max(...result.positions.filter((_,i)=>i%3===2))-Math.min(...result.positions.filter((_,i)=>i%3===2))>.03);
});
test('refuses unregistered or uncalibrated views instead of fabricating a mesh',()=>{
 const {points,views}=scene();
 assert.throws(()=>reconstructDense({points,views:views.slice(0,1)},{resolution:40}),/три независимых/);
 const broken=views.map(v=>({...v,depth:new Float32Array(v.depth.length).fill(7)}));
 assert.throws(()=>reconstructDense({points,views:broken},{resolution:40}),/Не удалось согласовать/);
});

test('exports actual indexed polygonal PLY with face records',async()=>{
 const r=reconstructDense(scene(),{resolution:40});
 const blob=encodeDensePly(r),header=await blob.slice(0,1024).text();
 assert.match(header,/format binary_little_endian 1.0/);
 assert.match(header,new RegExp('element vertex '+r.stats.vertices+'\n'));
 assert.match(header,new RegExp('element face '+r.stats.triangles+'\n'));
 const headerEnd=header.indexOf('end_header\n')+'end_header\n'.length;
 assert.ok(headerEnd>0);
 const headerBytes=new TextEncoder().encode(header.slice(0,headerEnd)).length;
 assert.equal(blob.size,headerBytes+r.stats.vertices*15+r.stats.triangles*13);
 await assert.rejects(async()=>encodeDensePly({...r,colors:new Float32Array(3)}),/Недопустимая геометрия/);
});
