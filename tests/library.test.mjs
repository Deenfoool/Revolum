import test from 'node:test';
import assert from 'node:assert/strict';
import {isNamedProjectId} from '../src/storage.js';
test('named project identifiers are bounded and cannot escape their keyspace',()=>{
 assert.equal(isNamedProjectId('12345678'),true);
 assert.equal(isNamedProjectId('550e8400-e29b-41d4-a716-446655440000'),true);
 for(const id of ['',null,'named:12345678','../../project',' abcdefghi ','abc/defghi','x'.repeat(65)])assert.equal(isNamedProjectId(id),false);
});
