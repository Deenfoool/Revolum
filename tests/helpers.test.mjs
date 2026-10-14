import test from 'node:test';
import assert from 'node:assert/strict';
import { isPhoto, formatSize, PHOTO_EXTENSIONS } from '../src/photos.js';
import { safeFilename } from '../src/storage.js';
test('photo types',()=>{assert.equal(isPhoto({name:'capture.HEIC',type:''}),true);assert.equal(isPhoto({name:'part.glb',type:'model/gltf-binary'}),false);assert.ok(PHOTO_EXTENSIONS.includes('webp'))});
test('size labels',()=>{assert.equal(formatSize(0),'0 KB');assert.equal(formatSize(1048576),'1.0 MB');assert.equal(formatSize(2147483648),'2.00 GB')});
test('export filename normalization',()=>{assert.equal(safeFilename(' A scan / new '),'A-scan-new');assert.equal(safeFilename('!!!'),'revolum')});
