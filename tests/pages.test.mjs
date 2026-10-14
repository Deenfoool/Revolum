import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const html=readFileSync(join(root,'index.html'),'utf8');
const file=path=>join(root,path);
test('GitHub Pages deploys directly from main/root without Jekyll',()=>{
  assert.ok(existsSync(file('index.html')),'root index.html missing');
  assert.ok(existsSync(file('.nojekyll')),'root .nojekyll missing');
  assert.equal(readFileSync(file('.nojekyll'),'utf8'),'');
});
test('all local launch assets use project-relative URLs and exist',()=>{
  for(const path of ['./styles.css','./src/main.js','./assets/favicon.svg']){
    assert.ok(html.includes(path),'entry page does not reference '+path);
    assert.ok(existsSync(file(path.slice(2))), 'asset missing: '+path);
  }
  assert.doesNotMatch(html,/(?:href|src)\s*=\s*["']\/(?:src|assets|styles\.css)/);
  assert.ok(html.includes('type="importmap"'));
  assert.ok(html.includes('"three/addons/"'));
});
test('relative application module graph exists',()=>{
  const modules=['src/main.js','src/scene.js','src/photos.js','src/storage.js','src/capture.js'];
  for(const module of modules)assert.ok(existsSync(file(module)),module+' missing');
  const entry=readFileSync(file('src/main.js'),'utf8');
  for(const part of ['./scene.js','./photos.js','./storage.js','./capture.js'])assert.ok(entry.includes(part),'import missing: '+part);
});
