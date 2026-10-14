const DB_NAME='revolum-studio', DB_VERSION=2, STORE='projects', META='project-index', CURRENT='current';
function database(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window)){reject(Error('IndexedDB недоступен в этом браузере'));return}const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);if(!request.result.objectStoreNames.contains(META))request.result.createObjectStore(META)};request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)};request.onerror=()=>reject(request.error)})}
export async function saveLocal(project){const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({project,savedAt:new Date().toISOString()},CURRENT);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Запись отменена'))})}finally{db.close()}}
export async function loadLocal(){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const request=tx.objectStore(STORE).get(CURRENT);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)})}finally{db.close()}}
// Named snapshots are separate from the autosave slot. Store small index entries
// independently so a library listing does not materialize every image/model Blob.
export const isNamedProjectId=id=>typeof id==='string'&&/^[a-z0-9-]{8,64}$/.test(id);
export async function listNamedProjects(){
  const db=await database();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(META,'readonly'),req=tx.objectStore(META).getAll();
    req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));
    req.onerror=()=>reject(req.error);
  })}finally{db.close()}
}
export async function saveNamedProject(project){
  const existing=await listNamedProjects();
  if(existing.length>=12)throw Error('Максимум 12 проектов. Удалите ненужную копию.');
  const id=crypto.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
  if(!isNamedProjectId(id))throw Error('Не удалось создать ID проекта');
  const savedAt=new Date().toISOString(),name=(project.name||'Untitled scan').trim().slice(0,56)||'Untitled scan';
  const summary={id,name,savedAt,objects:project.objects?.length||0,photos:project.photos?.length||0};
  const db=await database();
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction([STORE,META],'readwrite');
    tx.objectStore(STORE).put({project:{...project,name},savedAt},'named:'+id);
    tx.objectStore(META).put(summary,id);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Сохранение отменено'));
  });return summary}finally{db.close()}
}
export async function loadNamedProject(id){
  if(!isNamedProjectId(id))throw Error('Некорректный ID проекта');
  const db=await database();
  try{return await new Promise((resolve,reject)=>{
    const req=db.transaction(STORE,'readonly').objectStore(STORE).get('named:'+id);
    req.onsuccess=()=>resolve(req.result?.project||null);req.onerror=()=>reject(req.error);
  })}finally{db.close()}
}
export async function deleteNamedProject(id){
  if(!isNamedProjectId(id))throw Error('Некорректный ID проекта');
  const db=await database();
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction([STORE,META],'readwrite');
    tx.objectStore(STORE).delete('named:'+id);tx.objectStore(META).delete(id);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Удаление отменено'));
  })}finally{db.close()}
}
const extOf=name=>(name?.split('.').pop()||'bin').replace(/[^a-zA-Z0-9]/g,'').toLowerCase().slice(0,8)||'bin';
function zipLib(){if(!window.JSZip)throw Error('Библиотека ZIP не загрузилась. Проверьте подключение к интернету.');return window.JSZip}
export async function exportProjectZip(project,sceneBlob=null) {
  const zip=new (zipLib())(),objects=[],photos=[];
  for(const item of project.objects){
    const {sourceFile,resourceFiles,...rest}=item;const record={...rest};
    if(sourceFile){record.sourcePath='models/'+item.id+'.'+extOf(sourceFile.name);record.sourceName=sourceFile.name;record.sourceType=sourceFile.type||'';zip.file(record.sourcePath,sourceFile)}
    record.resources=[];for(const [index,asset] of (item.resourceFiles||[]).entries()){const path='models/'+item.id+'/dep-'+index+'.'+extOf(asset.name);zip.file(path,asset);record.resources.push({path,name:asset.name,type:asset.type||''})}
    objects.push(record);
  }
  for(const item of project.photos){
    const {file,url,...rest}=item;
    const path='photos/'+item.id+'.'+extOf(file.name);
    photos.push({...rest,sourcePath:path,sourceName:file.name,sourceType:file.type||''});zip.file(path,file);
  }
  const manifest={format:'revolum-project',version:1,createdAt:new Date().toISOString(),name:project.name,objects,photos};
  zip.file('manifest.json',JSON.stringify(manifest,null,2));
  if(sceneBlob)zip.file('scene.glb',sceneBlob);
  zip.file('README.txt','Revolum project archive. Open through Revolum Studio > ZIP-проект. Original scan photographs and model files are in photos/ and models/. scene.glb is a derived export if available.\n');
  return zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});
}
export async function importProjectZip(file){
  if(file.size>512*1024*1024)throw Error('ZIP превышает лимит 512 МБ');
  const zip=await zipLib().loadAsync(file,{checkCRC32:true});
  const manifestEntry=zip.file('manifest.json');if(!manifestEntry)throw Error('В архиве отсутствует manifest.json');
  let manifest;
  try{manifest=JSON.parse(await manifestEntry.async('string'))}catch{throw Error('Повреждённый manifest.json')}
  if(manifest.format!=='revolum-project'||manifest.version!==1||!Array.isArray(manifest.objects)||!Array.isArray(manifest.photos))throw Error('Несовместимый формат проекта');
  if(manifest.objects.length>300||manifest.photos.length>500)throw Error('Превышен лимит объектов или фотографий');
  let total=0;for(const entry of Object.values(zip.files)){if(entry.dir)continue;total+=entry._data?.uncompressedSize||0;if(total>1.5*1024**3)throw Error('Архив содержит слишком много данных')}
  const restoreFile=async row=>{if(!row.sourcePath)return null;const path=row.sourcePath;if(path.includes('..')||path.startsWith('/')||!(/^(models|photos)\/(?:[a-zA-Z0-9._-]+\/){0,3}[a-zA-Z0-9._-]+$/.test(path)))throw Error('Некорректный путь в архиве');const entry=zip.file(path);if(!entry)throw Error('В архиве отсутствует '+path);const data=await entry.async('blob');return new File([data],row.sourceName||path.split('/').pop(),{type:row.sourceType||''})};
  const objects=[];for(const row of manifest.objects){const sourceFile=await restoreFile(row);const resourceFiles=[];if((row.resources||[]).length>200)throw Error('Слишком много связанных файлов');for(const dep of (row.resources||[])){resourceFiles.push(await restoreFile({sourcePath:dep.path,sourceName:dep.name,sourceType:dep.type}))}objects.push({id:row.id,name:row.name,kind:row.kind,primitive:row.primitive||null,transform:row.transform,sourceFile,resourceFiles,method:['multiview-depth-tsdf','mesh-processed','monocular-depth','voxel-filtered'].includes(row.method)?row.method:null,meshReport:row.meshReport&&typeof row.meshReport==='object'&&JSON.stringify(row.meshReport).length<4096?row.meshReport:null})}
  const photos=[];for(const row of manifest.photos){const source=await restoreFile(row);if(!source)throw Error('Фото отсутствует');photos.push({id:row.id,file:source,width:row.width,height:row.height,flags:row.flags||[],hash:row.hash||null,mean:Number.isFinite(row.mean)?row.mean:null,sharpness:Number.isFinite(row.sharpness)?row.sharpness:null,exif:row.exif||null})}
  return {name:String(manifest.name||'Imported project').slice(0,56),objects,photos};
}
export function download(blob,filename){const link=document.createElement('a');const url=URL.createObjectURL(blob);link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
export function safeFilename(name){return (name||'revolum').trim().replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'revolum'}
