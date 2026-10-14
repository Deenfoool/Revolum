import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('dense MVS remains a static browser workflow with proper UI and cancellation',()=>{
 const html=read('index.html'),main=read('src/main.js'),job=read('src/mvs-job.js'),worker=read('src/mvs-worker.js'),scene=read('src/scene.js');
 for(const id of ['mvs-start','mvs-cancel','mvs-progress','mvs-status','mvs-resolution','mvs-views','mvs-download-glb','mvs-download-ply'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(main,/denseJob\.run\(/);assert.match(main,/denseJob\.cancel\(\)/);
 assert.match(job,/estimateDepth\(file/);assert.match(job,/new Worker\(new URL\('\.\/mvs-worker\.js',import\.meta\.url\)/);
 assert.match(job,/this\.worker\?\.terminate\(\)/);
 assert.match(worker,/reconstructDense\(/);
 assert.match(scene,/async addDenseMesh\(/);assert.match(scene,/new GLTFExporter\(\)\.parseAsync\(root/);
 assert.ok(existsSync(new URL('../src/mvs-core.js',import.meta.url)));
});
