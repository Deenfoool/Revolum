// Portable output and evidence-based SfM diagnostics. No external fetch/upload.
const safe=(name)=>String(name||'revolum').trim().replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'revolum';

export function sfmDiagnostics(recon,frames=[]){
  if(!recon||!Array.isArray(recon.cams)||!Array.isArray(recon.points))throw Error('Нет результатов SfM');
  const registered=new Set();
  for(const c of recon.cams){
    const i=c?.imgIdx;
    if(Number.isInteger(i)&&i>=0&&i<frames.length)registered.add(i);
  }
  const missing=frames.map((f,i)=>({index:i,name:String(f?.name||'Frame '+(i+1))})).filter(f=>!registered.has(f.index));
  const total=frames.length,percentage=total?Math.round(registered.size/total*100):0;
  const quality=percentage>=85&&recon.points.length>=250?'good':percentage>=55&&recon.points.length>=50?'partial':'weak';
  return {
    input:total,registered:registered.size,registrationRate:percentage,
    sparsePoints:recon.points.length,unregistered:missing,
    rmsBA:Number.isFinite(recon.rmsBA)?recon.rmsBA:null,
    medianReprojectionError:Number.isFinite(recon.medErr)?recon.medErr:null,
    scale:'arbitrary (uncalibrated SfM)',quality,
    warning:missing.length?'Некоторые фотографии не удалось зарегистрировать. Проверьте перекрытие, смаз и неподвижность сцены.':null
  };
}
export async function verifyGaussianPly(blob){
  if(!(blob instanceof Blob)||blob.size<128)throw Error('Результат 3DGS пустой или повреждён');
  const header=await blob.slice(0,Math.min(blob.size,65536)).text();
  if(!header.startsWith('ply\n')||!header.includes('format binary_little_endian 1.0\n')||
     !/element vertex [1-9][0-9]*\n/.test(header)||!header.includes('end_header\n')||
     !header.includes('property float opacity\n')||!header.includes('property float scale_0\n')){
    throw Error('Результат не соответствует формату Gaussian Splatting PLY');
  }
  return true;
}
export async function scanBundle({name,splat,cloud,cameras,diagnostics,zipConstructor}){
  await verifyGaussianPly(splat);
  if(!(cloud instanceof Blob)||!cloud.size)throw Error('Разреженное облако отсутствует');
  if(!(cameras instanceof Blob)||!cameras.size)throw Error('Файл камер отсутствует');
  if(typeof zipConstructor!=='function')throw Error('JSZip не загружен');
  const zip=new zipConstructor();
  zip.file('gaussian-splats.ply',splat,{compression:'STORE'});
  zip.file('sparse-cloud.ply',cloud,{compression:'STORE'});
  zip.file('camera-poses.json',cameras,{compression:'DEFLATE'});
  const manifest={
    format:'revolum-scan',version:1,name:String(name||'Revolum scan').slice(0,80),
    createdAt:new Date().toISOString(),
    description:'SfM point cloud, camera positions and trained Gaussian Splatting PLY. PLY is not a polygonal watertight mesh.',
    inputPhotosIncluded:false,geometryScale:'arbitrary',
    diagnostics
  };
  zip.file('manifest.json',JSON.stringify(manifest,null,2),{compression:'DEFLATE'});
  zip.file('README.txt','REVOLUM SCAN BUNDLE\n\nGaussian-splats.ply: learned anisotropic Gaussian primitives (standard 3DGS PLY).\nsparse-cloud.ply: colored triangulated SfM landmarks.\ncamera-poses.json: recovered camera extrinsics and intrinsics, arbitrary scale.\nOriginal photos are NOT included here: export your Revolum Project ZIP separately.\n');
  return {blob:await zip.generateAsync({type:'blob',compression:'STORE',streamFiles:true}),filename:safe(name)+'-scan.zip'};
}
