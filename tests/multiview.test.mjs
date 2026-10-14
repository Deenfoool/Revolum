import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
test('vendored Splat.js is pinned and includes all local engine modules',()=>{
 const expected=['src/index.js','src/session.js','src/gpu/context.js','src/gs/init.js','src/gs/trainer.js','src/gs/shaders.js','src/sfm/sfm.js','src/sfm/geometry.js','src/sfm/ba.js','src/sfm/sift.js','src/sfm/featworker.js','src/sfm/pairworker.js','src/io/frames.js','src/io/ply.js','src/vendor/mediabunny.min.mjs'];
 for(const path of expected)assert.ok(statSync(resolve(root,'vendor/splatjs',path)).size>100, path+' missing');
 assert.ok(existsSync(resolve(root,'vendor/splatjs/LICENSE')));
 assert.ok(existsSync(resolve(root,'vendor/splatjs/MEDIABUNNY_LICENSE.txt')));
 assert.match(read('THIRD_PARTY_NOTICES.md'),/88efe9aaf32279b0b9bcb781ea0deb4d60c49dff/);
});
test('full multiview entry is wired into the static Photo Scan UI',()=>{
 const h=read('index.html'),js=read('src/main.js'),adapter=read('src/multiview.js');
 for(const id of ['mv-start','mv-cancel','mv-pause','mv-resume','mv-finish','mv-new','mv-preset','mv-canvas','mv-camera','mv-export-ply','mv-export-cloud','mv-export-cameras','mv-cloud-to-scene']){
  assert.match(h,new RegExp('id="'+id+'"'));
 }
 assert.match(js,/import\('\.\/multiview\.js'\)/);
 assert.match(adapter,/createSession\(/);
 assert.match(adapter,/await session\.load\(files\)/);
 assert.match(adapter,/await session\.solve\(/);
 assert.match(adapter,/await session\.seed\(/);
 assert.match(adapter,/session\.start\(\)/);
 assert.match(adapter,/session\.exportPlyBlob\(\)/);
 assert.match(adapter,/if\(!navigator\.gpu\)/);
});
test('relative import and worker paths in vendored source exist',()=>{
 const walk=['src/index.js','src/session.js','src/sfm/sfm.js','src/io/frames.js','src/gs/trainer.js','src/io/video.js'];
 for(const p of walk){
  const body=read('vendor/splatjs/'+p);
  const imports=[...body.matchAll(/(?:from\s*|import\s*\(|new URL\s*\()\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
  for(const spec of imports.filter(x=>x.startsWith('.'))){
   const resolved=resolve(root,'vendor/splatjs',dirname(p),spec);
   assert.ok(existsSync(resolved),p+' references missing '+spec);
  }
 }
});

test('SfM diagnostics and export/backup controls are wired',()=>{
 const html=read('index.html'),main=read('src/main.js'),adapter=read('src/multiview.js');
 for(const id of ['mv-diagnostics','mv-backup-warning','mv-export-bundle']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(main,/renderMultiviewReport\(/);
 assert.match(main,/exportMultiviewBundle\(/);
 assert.match(main,/beforeunload/);
 assert.match(adapter,/const minCameras=Math\.max\(4,Math\.ceil\(files\.length\*\.5\)\)/);
 assert.match(adapter,/exportPackage\(name,zipConstructor\)/);
 assert.match(adapter,/this\.report=sfmDiagnostics\(/);
 assert.ok(existsSync(resolve(root,'src/scan-package.js')));
});
