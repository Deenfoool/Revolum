import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('QEM and bounded audit operate in the existing mesh worker and Object Studio',()=>{
 const html=read('index.html'),main=read('src/main.js'),scene=read('src/scene.js'),worker=read('src/mesh-tools-worker.js'),ops=read('src/mesh-operations.js'),storage=read('src/storage.js');
 for(const id of ['mesh-qem','mesh-qem-ratio','mesh-audit','mesh-audit-result','mesh-audit-download'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(worker,/decimateQEM\(/);assert.match(worker,/auditMesh\(/);
 assert.match(ops,/'qem','audit'/);
 assert.match(scene,/async auditEditableMesh\(/);assert.match(scene,/item\.meshAudit=audit/);
 assert.match(main,/renderMeshAudit\(/);assert.match(main,/processSelectedMesh\('qem'\)/);
 assert.match(storage,/meshAudit:row\.meshAudit/);
 for(const path of ['src/mesh-audit.js','src/mesh-qem.js'])assert.ok(existsSync(new URL('../'+path,import.meta.url)));
});
