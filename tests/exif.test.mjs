import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExifBytes} from '../src/exif.js';

// Hand-made little-endian EXIF/JPEG fixture: Make, DateTimeOriginal, and GPS pointer.
function fixture(){
  const tiff=new Uint8Array(160),v=new DataView(tiff.buffer);
  tiff[0]=73;tiff[1]=73;v.setUint16(2,42,true);v.setUint32(4,8,true);
  v.setUint16(8,3,true);
  const tag=(at,id,type,count,val)=>{v.setUint16(at,id,true);v.setUint16(at+2,type,true);v.setUint32(at+4,count,true);v.setUint32(at+8,val,true)};
  tag(10,0x010f,2,7,52);tag(22,0x8769,4,1,68);tag(34,0x8825,4,1,120);
  tiff.set(new TextEncoder().encode('Canon\0'),52);
  v.setUint16(68,1,true);tag(70,0x9003,2,20,88);
  tiff.set(new TextEncoder().encode('2026:10:14 12:00:00\0'),88);
  const payload=new Uint8Array(6+tiff.length);payload.set(new Uint8Array([69,120,105,102,0,0]));payload.set(tiff,6);
  const len=payload.length+2;
  const jpeg=new Uint8Array(2+2+2+payload.length+2);jpeg.set([255,216,255,225,len>>8,len&255]);jpeg.set(payload,6);jpeg.set([255,217],6+payload.length);
  return jpeg;
}
test('reads bounded EXIF and flags GPS without retaining coordinates',()=>{
 const exif=parseExifBytes(fixture());
 assert.equal(exif.make,'Canon');assert.equal(exif.hasGps,true);
 assert.equal(exif.date,'2026:10:14 12:00:00');
 assert.equal('latitude' in exif,false);assert.equal('longitude' in exif,false);
});
test('ignores non-JPEG and malformed EXIF',()=>{
 assert.equal(parseExifBytes(new Uint8Array([137,80,78,71])),null);
 assert.equal(parseExifBytes(new Uint8Array([255,216,255,225,0,2])),null);
 const clipped=fixture().slice(0,40);assert.equal(parseExifBytes(clipped),null);
});
