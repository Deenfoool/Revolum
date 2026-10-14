import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('HTML versioned entry and dynamic engine import are independently cache-busted',()=>{
 const html=read('index.html'),main=read('src/main.js'),adapter=read('src/multiview.js');
 assert.match(html,/src="\.\/src\/main\.js\?v=0\.4\.5-abortdiag"/);
 assert.match(html,/v0\.4\.5/);
 assert.match(main,/APP_BUILD='0\.4\.5-abortdiag'/);
 assert.match(main,/import\('\.\/multiview\.js\?v=0\.4\.5-abortdiag'\)/);
 assert.match(adapter,/from '\.\.\/vendor\/splatjs\/src\/session\.js\?v=0\.4\.5-abortdiag'/);
 assert.doesNotMatch(adapter,/from '\.\.\/vendor\/splatjs\/src\/index\.js'/);
});
test('the module-loading failure is diagnosed before invoking the GPU adapter',()=>{
 const main=read('src/main.js'),html=read('index.html');
 assert.match(main,/logScan\('module-import'/);
 assert.match(main,/logScan\('module-ready'/);
 assert.match(main,/scanStartupError\(error,stage\)/);
 assert.match(main,/stage==='module-import'\?'загрузки JS-модуля SfM\/3DGS'/);
 assert.match(main,/Ошибка SfM\/3DGS:/);
 assert.doesNotMatch(main,/toast\('SfM \/ Gaussian Splatting:/);
 assert.match(html,/id="mv-runtime-version"/);
 assert.match(html,/id="mv-download-diagnostic"/);
});
test('diagnostics stay local and exclude original image contents and image names',()=>{
 const main=read('src/main.js');
 assert.match(main,/JSON\.stringify\(scanDiagnostic\(\),null,2\)/);
 assert.match(main,/photoTypes:/);
 assert.match(main,/photoCount:/);
 assert.doesNotMatch(main,/fetch\([^)]*scanDiagnostic/);
});
