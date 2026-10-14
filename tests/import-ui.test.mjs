import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
test('batch import controls exist and expose progress',()=>{
 for(const id of ['import-status','import-progress','import-status-text','import-cancel-btn'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/role="status" aria-live="polite"/);
});
test('photo and mesh queues check cancellation and retain completed assets',()=>{
 assert.match(source,/function beginImport\(/);
 assert.match(source,/if\(signal\.aborted\)break/);
 assert.match(source,/state\.importController\?\.abort\(\)/);
 assert.match(source,/if\(successes\)\{queueSave\(\)/);
 assert.match(source,/if\(added\)\{commitHistory\(before\)/);
});
