import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('indexed color mesh tools operate in Worker and are wired to Object Studio',()=>{
 const html=read('index.html'),main=read('src/main.js'),scene=read('src/scene.js'),ops=read('src/mesh-operations.js'),worker=read('src/mesh-tools-worker.js');
 for(const id of ['mesh-tools','mesh-cell','mesh-simplify','mesh-orient','mesh-tool-status'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(main,/engine\.getEditableMesh\(item\.id\)/);
 assert.match(main,/engine\.processMesh\(id,method/);
 assert.match(worker,/simplifyMesh\(/);assert.match(worker,/orientMesh\(/);
 assert.match(ops,/new Worker\(new URL\('\.\/mesh-tools-worker\.js',import\.meta\.url\)/);
 assert.match(scene,/await runMeshOperation\(source,method,cellRatio\)/);
 assert.match(scene,/exportRoot\.position\.set\(0,0,0\)/);
 assert.match(scene,/item\.sourceFile=sourceFile/);
 assert.match(scene,/method:item\.method\|\|null,meshReport:item\.meshReport\|\|null/);
 assert.ok(existsSync(new URL('../src/mesh-tools.js',import.meta.url)));
});
test('portable ZIP restore retains processed-mesh metadata without bumping existing manifest schema',()=>{
 const storage=read('src/storage.js');
 assert.match(storage,/meshReport:row\.meshReport/);
 assert.match(storage,/mesh-processed/);
 assert.match(storage,/const record=\{\.\.\.rest\}/);
 assert.match(storage,/version:1,createdAt/);
});
