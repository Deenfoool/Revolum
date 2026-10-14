// Minimal, bounded JPEG APP1 / TIFF EXIF reader. All processing is local.
// Deliberately report GPS presence but never extract or display GPS coordinates.
const textDecoder=new TextDecoder('utf-8',{fatal:false});
function ascii(bytes,start,count) {
  const value=bytes.subarray(start,start+count);
  const last=value.indexOf(0);
  return textDecoder.decode(last<0?value:value.subarray(0,last)).trim().slice(0,120);
}
function parseTIFF(bytes,base,end) {
  if(base+8>end)return null;
  const little=bytes[base]===0x49&&bytes[base+1]===0x49;
  if(!little && !(bytes[base]===0x4d&&bytes[base+1]===0x4d))return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=pos=>pos+2<=end?view.getUint16(pos,little):null;
  const u32=pos=>pos+4<=end?view.getUint32(pos,little):null;
  if(u16(base+2)!==42)return null;
  const typeSize={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8};
  const ifd=(offset)=>{
    const pos=base+offset;if(offset<8||pos+2>end)return new Map();
    const count=u16(pos);if(count===null||count>256||pos+2+count*12+4>end)return new Map();
    const tags=new Map();
    for(let i=0;i<count;i++){
      const at=pos+2+i*12,id=u16(at),type=u16(at+2),n=u32(at+4),size=typeSize[type]*n;
      if(!typeSize[type]||n>4096||size>262144)continue;
      const valueAt=size<=4?at+8:base+u32(at+8);
      if(valueAt<base||valueAt+size>end)continue;
      const read=()=>{
        if(type===2)return ascii(bytes,valueAt,n);
        if(type===3)return u16(valueAt);
        if(type===4)return u32(valueAt);
        if(type===5){const den=u32(valueAt+4);return den?u32(valueAt)/den:null}
        return null;
      };
      tags.set(id,read());
    }
    return tags;
  };
  const primary=ifd(u32(base+4)),exif=ifd(primary.get(0x8769)||0);
  const make=primary.get(0x010f)||'',model=primary.get(0x0110)||'';
  const date=exif.get(0x9003)||primary.get(0x0132)||'';
  const lens=exif.get(0xa434)||'';
  const hasGps=Number.isInteger(primary.get(0x8825))&&primary.get(0x8825)>0;
  const orientation=primary.get(0x0112)||null;
  const iso=exif.get(0x8827)||null;
  return {make,model,lens,date,hasGps,orientation,iso};
}
export function parseExifBytes(input) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
  let pos=2;
  while(pos+4<=bytes.length){
    if(bytes[pos]!==0xff)break;
    while(pos<bytes.length&&bytes[pos]===0xff)pos++;
    if(pos>=bytes.length)break;
    const marker=bytes[pos++];
    if(marker===0xda||marker===0xd9)break;
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    if(pos+2>bytes.length)break;
    const length=(bytes[pos]<<8)|bytes[pos+1];
    if(length<2||pos+length>bytes.length)break;
    const payload=pos+2,end=pos+length;
    if(marker===0xe1&&end-payload>=14&&ascii(bytes,payload,6)==='Exif'){
      return parseTIFF(bytes,payload+6,end);
    }
    pos=end;
  }
  return null;
}
export async function inspectExif(file){
  if(!/\.(jpe?g)$/i.test(file.name||''))return null;
  const bytes=new Uint8Array(await file.slice(0,1024*1024).arrayBuffer());
  try{return parseExifBytes(bytes)}catch{return null}
}
