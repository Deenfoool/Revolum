import test from 'node:test';
import assert from 'node:assert/strict';
import { isPhoto,formatSize,PHOTO_EXTENSIONS,hashDistance,photoIssues } from '../src/photos.js';
import { sampleTimes } from '../src/capture.js';
import { safeFilename } from '../src/storage.js';
test('accepted photo extensions exclude SVG and model files',()=>{
  assert.equal(isPhoto({name:'capture.HEIC',type:''}),true);
  assert.equal(isPhoto({name:'room.webp',type:'image/webp'}),true);
  assert.equal(isPhoto({name:'unsafe.svg',type:'image/svg+xml'}),false);
  assert.equal(isPhoto({name:'part.glb',type:'model/gltf-binary'}),false);
  assert.ok(PHOTO_EXTENSIONS.includes('webp'));
});
test('size and filenames',()=>{
  assert.equal(formatSize(0),'0 KB');
  assert.equal(formatSize(1048576),'1.0 MB');
  assert.equal(formatSize(2147483648),'2.00 GB');
  assert.equal(safeFilename(' A scan / new '),'A-scan-new');
  assert.equal(safeFilename('!!!'),'revolum');
});
test('video sampling is bounded and monotonic',()=>{
  const stamps=sampleTimes(12,24);
  assert.equal(stamps.length,24);assert.ok(stamps[0]>0);assert.ok(stamps.at(-1)<12);
  assert.ok(stamps.every((t,i)=>i===0||t>stamps[i-1]));
  assert.equal(sampleTimes(.15,1)[0],.075);
  assert.equal(sampleTimes(300,100).length,48);
  assert.throws(()=>sampleTimes(Infinity,12));
  assert.throws(()=>sampleTimes(0,12));
});
test('similarity checks are conservative hints',()=>{
  const a='0'.repeat(64),b='0'.repeat(62)+'11',c='1'.repeat(64);
  assert.equal(hashDistance(a,b),2);
  assert.equal(hashDistance(a,c),64);
  assert.equal(hashDistance(null,c),Infinity);
  assert.deepEqual(photoIssues({flags:[],hash:b,mean:72},[{hash:a,mean:76,flags:[]}]),['Возможно повторяющийся ракурс']);
  assert.deepEqual(photoIssues({flags:['Низкое разрешение'],hash:c,mean:72},[{hash:a,mean:76}]),['Низкое разрешение']);
  assert.deepEqual(photoIssues({flags:[],hash:a,mean:250},[{hash:a,mean:15}]),[]);
});
