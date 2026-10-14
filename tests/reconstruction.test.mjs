import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('reconstruction UI and static worker entry points exist',()=>{
 const html=get('index.html'),main=get('src/main.js'),worker=get('src/depth-worker.js');
 for(const id of ['reconstruct-selected','reconstruct-cancel','depth-quality','depth-strength','reconstruct-status','depth-preview']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(main,/estimateDepth\(photo\.file/);
 assert.match(main,/engine\.addDepthReconstruction/);
 assert.match(worker,/pipeline\('depth-estimation',MODEL/);
 assert.match(worker,/device:'wasm',dtype:'q8'/);
 assert.ok(existsSync(new URL('../src/depth-reconstruct.js',import.meta.url)));
 assert.ok(existsSync(new URL('../src/depth-grid.js',import.meta.url)));
});
test('3D results use a real GLB source for portable project saves',()=>{
 const scene=get('src/scene.js');
 assert.match(scene,/addDepthReconstruction/);
 assert.match(scene,/new GLTFExporter\(\)\.parseAsync\(root/);
 assert.match(scene,/sourceFile=new File\(\[binary\]/);
 assert.match(scene,/sourceFile:item\.sourceFile/);
});
