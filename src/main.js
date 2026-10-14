import { Studio3D,MODEL_EXTENSIONS } from './scene.js';
import { inspectPhoto,isPhoto,formatSize,photoIssues } from './photos.js';
import { videoFrames,captureCameraFrame } from './capture.js';
import { estimateDepth,cancelDepth,depthGeometry,drawDepthPreview } from './depth-reconstruct.js';
import { saveLocal,loadLocal,exportProjectZip,importProjectZip,download,safeFilename,listNamedProjects,saveNamedProject,loadNamedProject,deleteNamedProject } from './storage.js';
const $=id=>document.getElementById(id);
const icons=()=>window.lucide?.createIcons();
const uid=()=>crypto.randomUUID?.()||'p'+Date.now()+Math.random().toString(36).slice(2);
const state={name:'Untitled scan',photos:[],selectedPhotoId:null,mode:'object',loading:false,busy:false,history:[],redo:[],transformStart:null,saveTimer:null,saveQueue:Promise.resolve(),importController:null,depthRunning:false};
let engine;
const APP_BUILD='0.4.5-abortdiag';
let mvTrace={build:APP_BUILD,createdAt:new Date().toISOString(),stage:'idle',events:[],error:null};
const logScan=(stage,message)=>{mvTrace.stage=stage;mvTrace.events.push({time:new Date().toISOString(),stage,message:String(message||'').slice(0,450)});if(mvTrace.events.length>45)mvTrace.events.shift()};
function scanStartupError(error,stage){
 const message=String(error?.message||error||'Unknown error'),name=String(error?.name||'Error');
 if(name==='AbortError'||/the operation was aborted/i.test(message)){
  const scope=stage==='module-import'?'загрузки JS-модуля SfM/3DGS':stage==='engine-import'?'загрузки интерфейса':'работы движка';
  return 'Браузер прервал операцию на этапе '+scope+'. Откройте скачиваемую диагностику и проверьте Console / Network: '+name+': '+message;
 }
 return message;
}
function scanDiagnostic(){const e=mvTrace.error;return {...mvTrace,build:APP_BUILD,siteVersion:$('mv-runtime-version')?.textContent||'',location:location.origin+location.pathname,browser:navigator.userAgent,webgpu:!!navigator.gpu,photoCount:state.photos.length,photoTypes:[...new Set(state.photos.map(p=>p.file?.type||'unknown'))],error:e}}
let videoController=null,cameraStream=null,multiview=null,mvPending=false,mvCancelled=false,mvExported=false,mvPackaging=false,mvJobSettled=true,denseJob=null,denseExport=null;
function toast(message,type='info'){const item=document.createElement('div');item.className='toast '+type;item.textContent=message;$('toast-stack').appendChild(item);setTimeout(()=>item.remove(),5300)}
const project=()=>({name:state.name,objects:engine.snapshot(),photos:state.photos.map(({url,...p})=>({...p}))});
function status(label){$('save-state').innerHTML='<i data-lucide="hard-drive"></i> '+label;icons()}
function queueSave(){if(state.loading)return;status('Изменено');clearTimeout(state.saveTimer);state.saveTimer=setTimeout(()=>saveNow(false),800)}
async function saveNow(notify=true){clearTimeout(state.saveTimer);const snapshot=project();status('Сохранение…');state.saveQueue=state.saveQueue.catch(()=>{}).then(()=>saveLocal(snapshot));try{await state.saveQueue;status('Сохранено локально');if(notify)toast('Проект сохранён в этом браузере','success')}catch(error){status('Ошибка записи');toast('Не удалось сохранить: '+error.message,'error')}}
function capture(){return project()}
function commitHistory(before){state.history.push(before||capture());if(state.history.length>25)state.history.shift();state.redo=[]}
async function restoreSnapshot(snapshot,notify=false){
  if(denseJob?.busy)denseJob.cancel();
  if(multiview){await multiview.reset();multiview=null;resetMultiviewUi()}
  state.loading=true;
  try{state.name=snapshot.name||'Untitled scan';$('project-name').value=state.name;
    clearPhotos();state.photos=(snapshot.photos||[]).map(p=>({...p,url:URL.createObjectURL(p.file)}));state.selectedPhotoId=state.photos[0]?.id||null;
    await engine.restore(snapshot.objects||[]);
    renderAll();if(notify)toast('Проект восстановлен','success');
  }finally{state.loading=false;queueSave()}
}
async function undo(){if(!state.history.length||state.busy||!canDiscardSplat())return;const prev=state.history.pop();state.redo.push(capture());await restoreSnapshot(prev)}
async function redo(){if(!state.redo.length||state.busy||!canDiscardSplat())return;const next=state.redo.pop();state.history.push(capture());await restoreSnapshot(next)}
function setBusy(b){state.busy=b;for(const id of ['export-btn','save-btn','import-model-btn','import-model-folder-btn','import-photos-btn','video-import-btn','camera-open-btn','photo-import-hero','photo-add-inline','library-btn','library-save-btn','new-btn','restore-btn','open-zip-btn','add-shape','delete-object','depth-quality','depth-strength','cloud-reduce','cloud-voxel','mesh-simplify','mesh-orient','mesh-cell','mesh-qem','mesh-qem-ratio','mesh-audit','mesh-audit-download'])$(id).disabled=b;$('reconstruct-selected').disabled=b||!state.selectedPhotoId;$('mv-start').disabled=b||state.photos.length<8||!!multiview?.ready||mvPending;$('mv-preset').disabled=b||!!multiview?.ready||mvPending;}
function beginImport(label,total){
  state.importController=new AbortController();setBusy(true);
  $('import-status').classList.remove('hidden');$('import-progress').max=Math.max(1,total);$('import-progress').value=0;
  $('import-status-text').textContent=label+' · 0 / '+total;
  $('import-cancel-btn').disabled=false;return state.importController.signal;
}
function updateImport(label,index,total,name){
  $('import-progress').value=index;
  $('import-status-text').textContent=label+' · '+index+' / '+total+(name?' · '+name:'');
}
function finishImport(){
  state.importController=null;$('import-status').classList.add('hidden');setBusy(false);
}
function renderAll(){renderScene();renderPhotos();renderInspector();renderMode()}
function renderScene(){
  const list=$('object-list');list.replaceChildren();
  for(const item of engine.items.values()){
    const row=document.createElement('button');row.type='button';row.className='item-entry'+(item.id===engine.selectedId?' active':'');
    row.innerHTML='<i data-lucide="'+(item.kind==='model'?'component':'box')+'"></i><span></span><small class="entry-tag">'+(item.kind==='model'?'3D':'SHAPE')+'</small>';
    row.querySelector('span').textContent=item.name;row.title=item.name;row.onclick=()=>engine.select(item.id);row.ondblclick=()=>engine.frame(item.id);list.append(row);
  }
  if(!engine.items.size){const blank=document.createElement('p');blank.className='list-empty';blank.textContent='Здесь появятся объекты вашей 3D-сцены.';list.append(blank)}
  $('asset-count').textContent=engine.items.size;
  $('empty-scene').classList.toggle('hidden',engine.items.size>0);
  $('viewport-stats').textContent=engine.items.size+' OBJECT'+(engine.items.size===1?'':'S');
  icons();
}
function renderMeshAudit(item){
 const root=$('mesh-audit-result');root.replaceChildren();
 const r=item?.meshAudit;
 $('mesh-audit-download').classList.toggle('hidden',!r);
 root.classList.toggle('hidden',!r);
 if(!r)return;
 const headline=document.createElement('strong');
 headline.textContent=r.intersection.status==='found'?'Найдены потенциальные пересечения':r.intersection.status==='clear'?'Несмежные треугольники: пересечений в пределах проверки не найдено':'Аудит ограничен / не завершён';
 root.append(headline);
 const p=document.createElement('p');
 p.textContent='Проверено пар: '+r.intersection.testedPairs.toLocaleString('ru-RU')+
 ' · найдено: '+r.intersection.countAtLeast+' · граничных рёбер: '+r.quality.boundaryEdges+
 ' · неманифолдных: '+r.quality.nonManifoldEdges+
 ' · габариты (локальные единицы): '+r.boundingBox.size.map(v=>v.toFixed(3)).join(' × ')+
 (r.signedVolume===null?' · объём недоступен':' · объём ≈ '+r.signedVolume.toFixed(4)+' условных³');
 root.append(p);
 const caution=document.createElement('p');caution.textContent='Печатная пригодность НЕ подтверждена: толщина стенок и физическая шкала не измерены; касания и смежные грани требуют отдельного CAD-аудита.';root.append(caution);
}
function renderInspector(){
  const item=engine.items.get(engine.selectedId);$('inspector-empty').classList.toggle('hidden',!!item);$('inspector-fields').classList.toggle('hidden',!item);
  if(!item)return;
  if(document.activeElement!==$('selected-name'))$('selected-name').value=item.name;
  const isCloud=!!engine.getPointCloud(item.id),isEditableMesh=!!engine.getEditableMesh(item.id);
  $('mesh-tools').classList.toggle('hidden',!isEditableMesh);
  renderMeshAudit(isEditableMesh?item:null);
  if(isEditableMesh){const r=item.meshReport;$('mesh-tool-status').textContent=r?('Последняя операция: '+(r.method==='consistent-winding'?'ориентация граней':'упрощение')+' · '+r.triangles.toLocaleString('ru-RU')+' треугольников · граничных рёбер '+r.quality.boundaryEdges+'. Модель не сертифицирована для 3D-печати.'):'Исходный Dense Mesh. Результат обработки сохраняется в GLB и поддерживает Undo.';}
  $('selected-kind').textContent=isCloud?'POINT CLOUD / PLY':item.kind==='model'?'IMPORTED MODEL':'PROCEDURAL SHAPE';
  $('cloud-tools').classList.toggle('hidden',!isCloud);
  const t=engine.getTransform(item.id);
  for(const input of document.querySelectorAll('[data-vector]')){
    if(document.activeElement===input)continue;
    const axis={x:0,y:1,z:2}[input.dataset.axis];
    const value=t[input.dataset.vector][axis];
    input.value=(input.dataset.vector==='rotation'?value*180/Math.PI:value).toFixed(2);
  }
  const info=engine.measure(item.id);$('detail-meshes').textContent=info.meshes;
  $('detail-triangles').textContent=info.triangles.toLocaleString('ru-RU');
  $('detail-points').textContent=(info.points||0).toLocaleString('ru-RU');
  $('detail-size').textContent=info.size.map(n=>n.toFixed(2)).join(' × ');
}
function clearPhotos(){for(const photo of state.photos)URL.revokeObjectURL(photo.url);state.photos=[];state.selectedPhotoId=null}
function removePhoto(id){if(state.busy){toast('Дождитесь завершения текущей операции');return}const before=capture();const index=state.photos.findIndex(p=>p.id===id);if(index<0)return;commitHistory(before);URL.revokeObjectURL(state.photos[index].url);state.photos.splice(index,1);if(state.selectedPhotoId===id)state.selectedPhotoId=state.photos[Math.min(index,state.photos.length-1)]?.id||null;renderPhotos();queueSave()}
function renderPhotos(){
  $('dock-photo-count').textContent=state.photos.length;$('photo-stat-count').textContent=String(state.photos.length).padStart(2,'0');$('photo-count-header').textContent='('+state.photos.length+')';
  $('photo-stat-resolution').textContent=String(state.photos.filter(p=>p.flags.some(f=>f.includes('разрешение'))).length).padStart(2,'0');
  $('photo-stat-exposure').textContent=String(state.photos.filter(p=>p.flags.some(f=>f.includes('темно')||f.includes('пересвет'))).length).padStart(2,'0');
  $('photo-stat-size').textContent=formatSize(state.photos.reduce((n,p)=>n+p.file.size,0));
  $('photo-stat-gps').textContent=String(state.photos.filter(p=>p.exif?.hasGps).length).padStart(2,'0');
  if(!state.photos.some(p=>p.id===state.selectedPhotoId))state.selectedPhotoId=state.photos[0]?.id||null;
  $('reconstruct-selected').disabled=state.busy||!state.selectedPhotoId;
  $('mv-input-count').textContent='Выбрано '+state.photos.length+' фото · требуется 8–120';
  $('mv-start').disabled=state.busy||state.photos.length<8||state.photos.length>120||!!multiview?.ready||mvPending;
  const issueMap=new Map();state.photos.forEach((p,i)=>issueMap.set(p.id,photoIssues(p,state.photos.slice(0,i))));
  const film=$('filmstrip'),grid=$('photo-grid'),side=$('photo-side-list');film.replaceChildren();grid.replaceChildren();side.replaceChildren();
  if(!state.photos.length){film.innerHTML='<span class="filmstrip-empty">Добавьте фотографии для нового скана <i data-lucide="arrow-right"></i></span>';grid.innerHTML='<div class="photo-empty"><i data-lucide="image-plus"></i><strong>Пока нет фотографий</strong><span>JPEG, PNG, WebP или HEIC (если браузер поддерживает декодирование)</span></div>';side.innerHTML='<p class="list-empty">Начните с фотографий объекта или помещения.</p>'}
  for(const p of state.photos){
    const thumb=document.createElement('img');thumb.className='film-thumb';thumb.src=p.url;thumb.alt=p.file.name;thumb.title=p.file.name;thumb.loading='lazy';thumb.onclick=()=>setMode('photos');film.append(thumb);
    const issues=issueMap.get(p.id);const tile=document.createElement('div');tile.className='photo-tile'+(issues.length?' flag':'')+(p.id===state.selectedPhotoId?' selected':'');tile.tabIndex=0;tile.role='button';tile.setAttribute('aria-label','Показать сведения о '+p.file.name);tile.onclick=()=>{if(state.busy)return;state.selectedPhotoId=p.id;renderPhotos()};tile.onkeydown=e=>{if(e.target===tile&&(e.key==='Enter'||e.key===' ')){e.preventDefault();state.selectedPhotoId=p.id;renderPhotos()}};
    const image=document.createElement('img');image.src=p.url;image.alt=p.file.name;image.loading='lazy';tile.append(image);
    const btn=document.createElement('button');btn.type='button';btn.className='tile-remove';btn.title='Удалить фото';btn.setAttribute('aria-label','Удалить '+p.file.name);btn.innerHTML='<i data-lucide="x"></i>';btn.onclick=e=>{e.stopPropagation();removePhoto(p.id)};tile.append(btn);
    const info=document.createElement('div');info.className='tile-info';const strong=document.createElement('strong');strong.textContent=p.file.name;strong.title=p.file.name;
    const details=document.createElement('span');details.textContent=p.width+' × '+p.height+(issues.length?' · ⚠':' · OK');details.title=issues.join('; ')||'Нет обнаруженных замечаний';info.append(strong,details);tile.append(info);grid.append(tile);
    const entry=document.createElement('div');entry.className='item-entry';entry.innerHTML='<i data-lucide="image"></i><span></span>';entry.querySelector('span').textContent=p.file.name;entry.title=p.file.name;side.append(entry);
  }
  const flagged=state.photos.filter(p=>issueMap.get(p.id).length);
  $('quality-overview').textContent=!state.photos.length?'Добавьте фото — мы проверим разрешение, приблизительную экспозицию, текстуру и схожесть кадров. Это не гарантия успешной реконструкции.':flagged.length?flagged.length+' из '+state.photos.length+' фото требуют внимания: '+flagged.slice(0,3).map(p=>p.file.name+' ('+issueMap.get(p.id).join(', ')+')').join('; ')+'.':'Автоматические предупреждения не обнаружены. Расположение камер и достаточность перекрытия кадров ещё не анализируются.';
  const active=state.photos.find(p=>p.id===state.selectedPhotoId),panel=$('photo-meta-details');panel.replaceChildren();
  if(active){
    const exif=active.exif,rows=[['Файл',active.file.name],['Камера',exif?[exif.make,exif.model].filter(Boolean).join(' ')||'Не указана':'Нет EXIF'],['Объектив',exif?.lens||'—'],['Дата съёмки',exif?.date||'—'],['ISO',exif?.iso||'—'],['Ориентация EXIF',exif?.orientation||'—'],['GPS',exif?.hasGps?'Есть в исходном файле — проверьте перед публикацией':'Не обнаружены']];
    for(const [key,value] of rows){const row=document.createElement('div');row.className='property-row';const label=document.createElement('span');label.textContent=key;const val=document.createElement('strong');val.textContent=String(value);val.title=String(value);row.append(label,val);panel.append(row)}
    const note=document.createElement('p');note.className='quality-note';note.textContent='Исходный файл сохраняется без удаления метаданных. EXIF поддерживается для JPEG; отсутствие данных не гарантирует отсутствия скрытой информации.';panel.append(note);
  }else{const note=document.createElement('p');note.className='quality-note';note.textContent='Выберите фотографию, чтобы посмотреть метаданные камеры и сведения о GPS.';panel.append(note)}
  icons();
}
function setMode(mode){state.mode=mode==='photos'?'photos':'object';renderMode()}
function renderMode(){
  const photos=state.mode==='photos';
  $('mode-object').classList.toggle('active',!photos);$('mode-photos').classList.toggle('active',photos);
  $('object-list').classList.toggle('hidden',photos);$('photo-side-list').classList.toggle('hidden',!photos);
  $('assets-title').textContent=photos?'PHOTO SET':'SCENE GRAPH';$('asset-count').textContent=photos?state.photos.length:engine.items.size;
  $('import-model-btn').classList.toggle('hidden',photos);$('import-model-folder-btn').classList.toggle('hidden',photos);$('import-photos-btn').classList.toggle('hidden',!photos);
  $('viewport-toolbar').classList.toggle('hidden',photos);$('viewport-section').classList.toggle('hidden',photos);
  $('photo-section').classList.toggle('hidden',!photos);$('dock').classList.toggle('hidden',photos);
  $('object-inspector').classList.toggle('hidden',photos);$('photo-inspector').classList.toggle('hidden',!photos);
  $('workspace-kicker').textContent=photos?'02 — PHOTO SCAN':'01 — OBJECT STUDIO';
  $('workspace-title').innerHTML=photos?'Capture the real world<span>.</span>':'Your digital workspace<span>.</span>';
  $('workspace-description').textContent=photos?'Подготовьте фотонабор, создайте SfM/3DGS и общий многоракурсный Mesh.':'Исследуйте, редактируйте и экспортируйте 3D-объекты.';
  if(!photos)requestAnimationFrame(()=>engine.resize());
}
async function addModels(files){
  if(state.busy)return;
  const all=[...files],models=all.filter(f=>MODEL_EXTENSIONS.includes(f.name.toLowerCase().split('.').pop()));
  if(!models.length){toast('Выберите GLB, glTF, OBJ, STL или PLY','error');return}
  const supported=/\.(mtl|bin|jpg|jpeg|png|webp|gif|ktx2)$/i;
  const resources=all.filter(f=>supported.test(f.name));
  setMode('object');const label='Импорт 3D',signal=beginImport(label,models.length);let successes=0,handled=0;
  try{
    for(const file of models){
      if(signal.aborted)break;
      updateImport(label,handled,models.length,file.name);
      const before=capture();
      try{await engine.importFile(file,{resourceFiles:resources});commitHistory(before);successes++}
      catch(error){toast(file.name+': '+error.message,'error')}
      handled++;updateImport(label,handled,models.length,file.name);
    }
  }finally{
    finishImport();renderScene();renderInspector();
    if(successes){queueSave();toast('Добавлено 3D-моделей: '+successes,'success')}
    if(signal.aborted)toast('Очередь импорта остановлена. Уже добавленные модели сохранены.');
  }
}
async function addPhotos(files){
  const images=[...files].filter(isPhoto);if(!images.length){toast('Добавьте файлы изображений','error');return}
  if(state.busy)return;
  setMode('photos');const before=capture(),label='Подготовка фото',signal=beginImport(label,images.length);let added=0,handled=0;
  try{
    for(const file of images){
      if(signal.aborted)break;
      if(state.photos.length>=500){toast('Лимит: 500 изображений','error');break}
      updateImport(label,handled,images.length,file.name);
      try{
        const report=await inspectPhoto(file);
        if(signal.aborted)break;
        const photo={id:uid(),file,url:URL.createObjectURL(file),...report};state.photos.push(photo);
        if(!state.selectedPhotoId)state.selectedPhotoId=photo.id;added++;
      }catch(error){toast(error.message,'error')}
      handled++;updateImport(label,handled,images.length,file.name);
    }
    if(added){commitHistory(before);renderPhotos();queueSave();toast('Добавлено фотографий: '+added,'success')}
  }finally{
    finishImport();if(signal.aborted)toast('Импорт остановлен. Уже добавленные фотографии сохранены.');
  }
}
function canDiscardSplat(){return !(multiview?.ready&&!mvExported)||confirm('Текущий обученный результат Gaussian Splatting не выгружен. Продолжить без сохранения PLY/ZIP?')}
function renderMultiviewReport(report){
  const panel=$('mv-diagnostics');panel.replaceChildren();
  if(!report){panel.classList.add('hidden');return}
  panel.classList.remove('hidden');
  const headline=document.createElement('strong');headline.textContent='SfM · '+report.registered+'/'+report.input+' камер ('+report.registrationRate+'%) · '+report.sparsePoints.toLocaleString('ru-RU')+' общих точек';panel.append(headline);
  if(Number.isFinite(report.rmsBA)){const metric=document.createElement('span');metric.textContent='RMS BA: '+report.rmsBA.toFixed(2)+' px';panel.append(metric)}
  if(report.unregistered?.length){
    const missing=document.createElement('p');missing.textContent='Не зарегистрированы: '+report.unregistered.map(f=>f.name).join(', ');panel.append(missing)
  }else{const note=document.createElement('p');note.textContent='Все кадры зарегистрированы. Масштаб реконструкции относительный.';panel.append(note)}
}
function cancelMultiview(){
  mvCancelled=true;multiview?.cancel();
  $('mv-status').textContent='Отмена запрошена. Текущая операция завершится перед освобождением ресурсов.';
  $('mv-cancel').disabled=true;
}
async function exportMultiviewBundle(){
  if(!multiview?.ready||mvPackaging||state.busy)return;
  if(!window.JSZip){toast('Не удалось загрузить JSZip для пакета скана','error');return}
  mvPackaging=true;setBusy(true);multiviewButtons();
  $('mv-status').textContent='Считывание GPU и подготовка пакета. Обучение ставится на паузу…';
  try{
    const {blob,filename}=await multiview.exportPackage(state.name,window.JSZip);
    download(blob,filename);mvExported=true;
    $('mv-status').textContent='Пакет выгружен. Обучение на паузе; при необходимости нажмите «Продолжить».';
    toast('Сохранён пакет скана: PLY + облако + камеры + отчёт','success');
  }catch(error){toast('Не удалось сохранить скан: '+error.message,'error');$('mv-status').textContent='Ошибка пакета: '+error.message}
  finally{mvPackaging=false;setBusy(false);multiviewButtons()}
}
function multiviewButtons(){
  const ready=!!multiview?.ready,phase=multiview?.phase||'idle';
  $('mv-pause').classList.toggle('hidden',phase!=='training');
  $('mv-resume').classList.toggle('hidden',phase!=='paused');
  $('mv-finish').classList.toggle('hidden',phase!=='training'&&phase!=='paused');
  $('mv-cancel').classList.toggle('hidden',!mvPending);
  $('mv-new').classList.toggle('hidden',!ready&&!mvPending);
  $('mv-new').disabled=mvPackaging;
  $('mv-pause').disabled=mvPackaging;$('mv-resume').disabled=mvPackaging;$('mv-finish').disabled=mvPackaging;
  for(const id of ['mv-export-ply','mv-export-cloud','mv-export-cameras','mv-cloud-to-scene','mv-export-bundle'])$(id).disabled=!ready||mvPackaging;
  $('mv-backup-warning').classList.toggle('hidden',!ready||mvExported);
  $('mv-start').disabled=state.busy||mvPending||ready||state.photos.length<8||state.photos.length>120;
  $('mv-preset').disabled=state.busy||mvPending||ready;
  $('mv-memory-profile').disabled=state.busy||mvPending||ready;
  $('mvs-start').disabled=!ready||state.busy||!!denseJob?.busy;
  $('mvs-resolution').disabled=!ready||state.busy||!!denseJob?.busy;
  $('mvs-views').disabled=!ready||state.busy||!!denseJob?.busy;
  $('mvs-clean-small').disabled=!ready||state.busy||!!denseJob?.busy;
  $('mvs-cancel').classList.toggle('hidden',!denseJob?.busy);
  icons();
}
function resetMultiviewUi(){
  $('mv-viewer').classList.add('hidden');$('mv-camera').replaceChildren();
  $('mv-progress').classList.add('hidden');$('mv-progress').value=0;
  $('mv-diagnostics').replaceChildren();$('mv-diagnostics').classList.add('hidden');
  $('mv-budget').textContent='';$('mv-budget').classList.add('hidden');
  $('mvs-progress').classList.add('hidden');$('mvs-progress').value=0;
  denseExport=null;$('mvs-downloads').classList.add('hidden');
  $('mvs-quality').replaceChildren();$('mvs-quality').classList.add('hidden');
  $('mvs-status').textContent='Сначала завершите расчёт камер в многокадровом режиме.';
  mvExported=false;mvPackaging=false;
  $('mv-runtime-version').textContent='Код Revolum '+APP_BUILD+' · JS загружен';
  $('mv-stats').textContent='SfM';$('mv-status').textContent='Нужен WebGPU и 8–120 перекрывающихся фотографий одной неподвижной сцены.';
  multiviewButtons();
}
async function startMultiview(){
  if(state.busy||mvPending||multiview?.ready)return;
  const photos=state.photos.map(p=>p.file);
  if(photos.length<8||photos.length>120){toast('Для многокадрового скана требуется от 8 до 120 кадров','error');return}
  if(!navigator.gpu){$('mv-status').textContent='WebGPU не обнаружен. Включите аппаратное ускорение или откройте сайт в совместимом браузере.';toast('WebGPU недоступен: настоящий тренер Gaussian Splats не может запуститься','error');return}
  mvTrace={build:APP_BUILD,createdAt:new Date().toISOString(),stage:'start',events:[],error:null};logScan('start','Нажата кнопка многокадровой реконструкции');
  mvPending=true;mvJobSettled=false;mvCancelled=false;mvExported=false;$('mv-cancel').disabled=false;setBusy(true);multiviewButtons();
  $('mv-progress').classList.remove('hidden');$('mv-progress').value=0;
  $('mv-status').textContent='Загрузка локального SfM/3DGS движка…';
  try{
    logScan('module-import','Запрашиваем локальные модули SfM/3DGS');
    const {MultiViewReconstruction}=await import('./multiview.js?v=0.4.5-abortdiag');
    logScan('module-ready','Модуль SfM/3DGS успешно загружен');
    if(mvCancelled)throw Error('Реконструкция отменена до запуска движка');
    multiview=new MultiViewReconstruction({
      canvas:$('mv-canvas'),
      onUpdate:e=>{
        logScan(e.stage||e.phase||'engine',e.message);
        $('mv-status').textContent=e.message;
        if(e.budget){$('mv-budget').classList.remove('hidden');$('mv-budget').textContent='Ресурсы: '+e.budget.profileLabel+' · '+e.budget.trainMaxDim+' px · '+e.budget.frames+' рабочих кадров · GPU targets ≈'+e.budget.packedMB+' МБ (лимит '+e.budget.bindingLimitMB+' МБ) · CPU frames ≈'+e.budget.cpuEstimateMB+' МБ. '+(e.budget.warning||'Общий расход GPU/CPU памяти будет выше этих оценок.');}
        if(e.stage&&e.total>0)$('mv-progress').value=Math.round(e.done/e.total*100);
        if(e.phase==='training'||e.phase==='paused'||e.phase==='complete')multiviewButtons();
        if(e.metrics){
          $('mv-progress').value=Math.round(e.metrics.iter/Number($('mv-preset').value)*100);
          $('mv-stats').textContent=e.metrics.iter.toLocaleString('ru-RU')+' итераций · '+(e.metrics.splats||0).toLocaleString('ru-RU')+' Gaussian Splats'+(Number.isFinite(e.metrics.psnrTrain)?' · PSNR '+e.metrics.psnrTrain.toFixed(1):'');
        }
      },
      onReady:e=>{
        $('mv-viewer').classList.remove('hidden');$('mv-camera').replaceChildren();
        for(const c of e.cameras){const option=document.createElement('option');option.value=String(c.index);option.textContent=(c.index+1)+' · '+c.name;$('mv-camera').append(option)}
        $('mv-stats').textContent='SfM: '+e.registered+'/'+e.input+' камер · '+e.points.toLocaleString('ru-RU')+' общих 3D-точек';
        renderMultiviewReport(e.report);
        mvPending=false;setBusy(false);multiviewButtons();
        toast('Камеры рассчитаны, 3DGS-тренер запущен.','success');
      },
      onComplete:e=>{multiviewButtons();$('mv-progress').value=100;toast('Обучение Gaussian Splats завершено. Можно экспортировать PLY.','success')},
      onError:(e,report)=>{mvTrace.error={stage:mvTrace.stage,name:e?.name||'Error',message:String(e?.message||e),stack:String(e?.stack||'').slice(0,3500)};renderMultiviewReport(report);$('mv-status').textContent='Ошибка многокадровой реконструкции: '+(e?.message||e);if(mvJobSettled){toast('Многокадровая реконструкция: '+(e?.message||e),'error');multiviewButtons()}}
    });
    const preset=Number($('mv-preset').value);
    await multiview.run(photos,{maxIters:preset,budgetProfile:$('mv-memory-profile').value,photoMeta:state.photos.map(p=>({width:p.width,height:p.height}))});
    mvJobSettled=true;
  }catch(error){
    const stage=mvTrace.stage;
    const cancelled=mvCancelled||error?.message==='Расчёт отменён пользователем.'||error?.message==='Реконструкция отменена';
    const detailed=scanStartupError(error,stage);
    mvTrace.error={stage,name:String(error?.name||'Error'),message:String(error?.message||error),displayMessage:detailed,stack:String(error?.stack||'').slice(0,3500)};
    logScan(cancelled?'cancelled':'failed',detailed);
    if(cancelled){$('mv-status').textContent='Расчёт отменён. Можно начать новый скан.';toast('Многокадровая реконструкция отменена.');}
    else{$('mv-status').textContent='Revolum '+APP_BUILD+' · '+detailed;toast('Ошибка SfM/3DGS: '+detailed,'error');console.error('[Revolum multiview '+APP_BUILD+']',stage,error);}
  }finally{mvJobSettled=true;mvPending=false;mvCancelled=false;setBusy(false);multiviewButtons()}
}
async function newMultiview(){
  if(denseJob?.busy)return;
  if(mvPending){cancelMultiview();return}
  if(multiview?.ready&&!mvExported&&!confirm('Обученный 3DGS результат ещё не экспортирован. Сбросить его без сохранения?'))return;
  try{await multiview?.reset()}catch(e){console.warn(e)}
  multiview=null;resetMultiviewUi();
}
function renderMvsQuality(stats){
  const el=$('mvs-quality');el.replaceChildren();
  const q=stats?.quality;if(!q){el.classList.add('hidden');return}
  el.classList.remove('hidden');
  const headline=document.createElement('strong');
  headline.textContent=q.topologicallyClosed?'Топология замкнута (не проверена для печати)':'Есть открытые края или нарушения топологии';
  el.append(headline);
  const rows=[
   'Граничные рёбра: '+q.boundaryEdges.toLocaleString('ru-RU'),
   'Неманифолдные рёбра: '+q.nonManifoldEdges.toLocaleString('ru-RU'),
   'Конфликты ориентации: '+q.windingConflicts.toLocaleString('ru-RU'),
   'Компоненты: '+q.fragmentsBefore+' → '+q.fragmentsAfter,
   'Удалены вырожденные грани: '+q.removedDegenerate.toLocaleString('ru-RU'),
   'Удалены дубли: '+q.removedDuplicates.toLocaleString('ru-RU'),
   'Удалены мелкие фрагменты: '+q.removedFragments+' ('+q.removedFragmentTriangles.toLocaleString('ru-RU')+' граней)'
  ];
  const grid=document.createElement('div');grid.className='mvs-quality-grid';
  for(const line of rows){const span=document.createElement('span');span.textContent=line;grid.append(span)}
  el.append(grid);
  const note=document.createElement('p');note.textContent=q.note;el.append(note);
}
async function startDenseMesh(){
  if(state.busy||!multiview?.ready||denseJob?.busy)return;
  const original=multiview;
  const source=state.photos.map(p=>p.file);
  const resolution=Number($('mvs-resolution').value),maxViews=Number($('mvs-views').value),cleanSmall=$('mvs-clean-small').checked;
  setBusy(true);$('mvs-start').disabled=true;$('mvs-cancel').disabled=false;$('mvs-cancel').classList.remove('hidden');
  try{
    const {DenseMeshJob}=await import('./mvs-job.js');
    denseJob=new DenseMeshJob();
    if(multiview.phase==='training')multiview.pause();
    $('mvs-progress').classList.remove('hidden');$('mvs-progress').value=0;
    $('mvs-status').textContent='Подготовка зарегистрированных камер…';
    const result=await denseJob.run(original,source,{resolution,maxViews,cleanSmall,onProgress:e=>{
      if(e.message)$('mvs-status').textContent=e.message;
      else if(e.stage==='fusion')$('mvs-status').textContent='Согласование глубины и TSDF: '+e.done+'/'+e.total;
      else if(e.stage==='extract')$('mvs-status').textContent='Извлечение треугольников: '+e.done+'/'+e.total;
      if(e.total&&e.done){
        const base=e.stage==='depth'?0:e.stage==='fusion'?45:75,span=e.stage==='depth'?45:e.stage==='fusion'?30:25;
        $('mvs-progress').value=Math.min(99,base+span*e.done/e.total);
      }
    }});
    if(original!==multiview)throw Error('SfM-проект изменился во время обработки');
    const {encodeDensePly}=await import('./mvs-core.js');
    const ply=encodeDensePly(result);
    const before=capture();
    const name='Multi-view Mesh / '+state.name;
    const item=await engine.addDenseMesh({...result,name});
    denseExport={glb:item.sourceFile,ply,name:safeFilename(state.name),stats:result.stats};
    renderMvsQuality(result.stats);
    $('mvs-downloads').classList.remove('hidden');
    commitHistory(before);queueSave();setMode('object');
    $('mvs-progress').value=100;
    $('mvs-status').textContent='Готово: '+result.stats.vertices.toLocaleString('ru-RU')+' вершин · '+result.stats.triangles.toLocaleString('ru-RU')+' треугольников · '+result.stats.calibrated+' согласованных камер. Пропущены: '+(result.stats.skipped.length?result.stats.skipped.map(v=>v.name+' ('+v.reason+')').join('; '):'нет')+'. Сетка может иметь открытые края.';
    toast('Общий полигональный Mesh добавлен в Object Studio: '+item.name,'success');
  }catch(error){
    $('mvs-status').textContent='Не удалось построить Mesh: '+error.message;
    toast('Dense Mesh: '+error.message,'error');
  }finally{
    denseJob=null;setBusy(false);multiviewButtons();
    $('mvs-cancel').classList.add('hidden');
  }
}
function cancelDenseMesh(){
  if(!denseJob?.busy)return;
  denseJob.cancel();$('mvs-cancel').disabled=true;
  $('mvs-status').textContent='Остановка расчёта Mesh и освобождение памяти…';
}
async function downloadMultiview(kind){
  if(!multiview?.ready)return;
  const map={ply:()=>multiview.exportPly(),cloud:()=>multiview.exportSparse(),cameras:()=>multiview.exportCameras()};
  if(!map[kind])return;
  const name=safeFilename(state.name),suffix={ply:'-gaussian-splats.ply',cloud:'-sparse-cloud.ply',cameras:'-cameras.json'}[kind];
  const button=$('mv-export-'+kind);button.disabled=true;
  try{if(kind==='ply'&&multiview.phase==='training')multiview.pause();const blob=await map[kind]();download(blob,name+suffix);if(kind==='ply')mvExported=true;multiviewButtons();toast('Файл '+suffix+' подготовлен к скачиванию','success')}
  catch(error){toast('Экспорт: '+error.message,'error')}
  finally{button.disabled=!multiview?.ready}
}
async function addSparseToScene(){
  if(!multiview?.ready||state.busy)return;
  setBusy(true);
  try{
    const blob=multiview.exportSparse(),file=new File([blob],safeFilename(state.name)+'-sparse.ply',{type:'application/octet-stream'});
    const before=capture();await engine.importFile(file);commitHistory(before);queueSave();setMode('object');
    toast('Рассчитанное общее облако точек добавлено в Object Studio','success');
  }catch(error){toast('Импорт облака: '+error.message,'error')}finally{setBusy(false)}
}
async function reconstructSelectedPhoto(){
  if(state.busy)return;
  const photo=state.photos.find(p=>p.id===state.selectedPhotoId);
  if(!photo){toast('Выберите фотографию для реконструкции','error');return}
  state.depthRunning=true;setBusy(true);
  $('reconstruct-cancel').classList.remove('hidden');
  $('depth-preview').classList.add('hidden');
  $('reconstruct-status').textContent='Инициализация локального движка…';
  try{
    const prediction=await estimateDepth(photo.file,update=>{
      if(update?.message)$('reconstruct-status').textContent=update.message;
    });
    if(!state.depthRunning)return;
    $('reconstruct-status').textContent='Создаём текстурированную сетку…';
    drawDepthPreview($('depth-preview'),prediction);
    $('depth-preview').classList.remove('hidden');
    const detail=Number($('depth-quality').value),strength=Number($('depth-strength').value);
    const {geometry,texture,grid}=await depthGeometry(photo.file,prediction,{columns:detail,strength});
    if(!state.depthRunning){geometry.dispose();texture.dispose();return}
    const before=capture();
    const name='Depth / '+photo.file.name.replace(/\.[^.]+$/,'');
    const item=await engine.addDepthReconstruction({geometry,texture,name});
    commitHistory(before);queueSave();setMode('object');
    $('reconstruct-status').textContent='Готово: '+grid.columns+' × '+grid.rows+' сегментов · '+grid.indices.length/3+' треугольников. Объект добавлен в сцену.';
    toast('3D-сетка создана: '+item.name+'. Доступен экспорт GLB/OBJ/STL.','success');
  }catch(error){
    $('reconstruct-status').textContent='Не получилось: '+error.message;
    toast('Реконструкция: '+error.message+'. Проверьте память и доступ к CDN / Hugging Face.','error');
  }finally{
    state.depthRunning=false;
    $('reconstruct-cancel').classList.add('hidden');
    setBusy(false);
  }
}
async function importVideo(file) {
  if(!file||state.busy)return;
  if(state.photos.length>=500){toast('В фотосете достигнут лимит 500 кадров','error');return}
  videoController=new AbortController();setBusy(true);
  $('capture-cancel-btn').classList.remove('hidden');$('capture-status').textContent='Чтение видео…';
  try{
    const available=500-state.photos.length,requested=Number($('frame-count').value);
    const frames=await videoFrames(file,{count:Math.min(requested,available),signal:videoController.signal,onProgress:(done,total)=>{$('capture-status').textContent='Кадры: '+done+' / '+total}});
    // addPhotos owns the normal quality checks, storage and undo history.
    setBusy(false);await addPhotos(frames);
    $('capture-status').textContent='Извлечено '+frames.length+' кадров';
  }catch(error){$('capture-status').textContent='Извлечение остановлено';toast(error.message,'error')}
  finally{videoController=null;$('capture-cancel-btn').classList.add('hidden');$('video-file').value='';setBusy(false)}
}
function stopCamera(){
  if(cameraStream){cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null}
  const preview=$('camera-preview');preview.pause();preview.srcObject=null;$('camera-shot-btn').disabled=true;
}
async function openCamera() {
  if(state.busy)return;
  if(!navigator.mediaDevices?.getUserMedia){toast('Камера недоступна: нужен HTTPS или localhost и совместимый браузер','error');return}
  const dialog=$('camera-dialog');dialog.showModal();$('camera-status').textContent='Запрос доступа…';
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
    if(!dialog.open){stream.getTracks().forEach(track=>track.stop());return}
    cameraStream=stream;const preview=$('camera-preview');preview.srcObject=stream;await preview.play();
    $('camera-status').textContent='Камера готова';$('camera-shot-btn').disabled=false;
    stream.getVideoTracks()[0]?.addEventListener('ended',()=>{stopCamera();$('camera-status').textContent='Камера отключена'});
  }catch(error){stopCamera();$('camera-status').textContent='Нет доступа к камере';toast('Камера: '+error.message,'error')}
}
async function shootCamera(){
  if(state.busy||!cameraStream)return;
  $('camera-shot-btn').disabled=true;
  try{const file=await captureCameraFrame($('camera-preview'));await addPhotos([file]);$('camera-status').textContent='Снимок добавлен · '+state.photos.length+' кадров'}
  catch(error){toast('Снимок не сохранён: '+error.message,'error')}
  finally{$('camera-shot-btn').disabled=!cameraStream}
}
function chooseShape(){const dialog=document.createElement('dialog');dialog.className='modal';dialog.innerHTML='<div class="modal-heading"><div><div class="overline">GEOMETRY / NEW</div><h2>Добавить фигуру<span>.</span></h2></div><button class="icon-btn close-modal" aria-label="Закрыть"><i data-lucide="x"></i></button></div><div class="export-options">'+['box','sphere','cylinder','torus','knot'].map(t=>'<button class="export-choice" data-shape="'+t+'"><i data-lucide="shapes"></i><span><strong>'+({box:'Куб',sphere:'Сфера',cylinder:'Цилиндр',torus:'Тор',knot:'Узел (демо)'}[t])+'</strong><small>Добавить в текущую сцену</small></span><i data-lucide="plus"></i></button>').join('')+'</div>';document.body.append(dialog);dialog.querySelector('.close-modal').onclick=()=>dialog.close();dialog.querySelectorAll('[data-shape]').forEach(btn=>btn.onclick=()=>{commitHistory();engine.addPrimitive(btn.dataset.shape);engine.frame(engine.selectedId);queueSave();dialog.close()});dialog.onclose=()=>dialog.remove();dialog.showModal();icons()}
async function doExport(format){if(state.busy)return;$('export-dialog').close();setBusy(true);try{
  const name=safeFilename(state.name);
  if(format==='zip'){
    let scene=null;if(engine.items.size)try{scene=await engine.exportScene('glb')}catch(error){toast('GLB не вложен в архив: '+error.message)};
    const blob=await exportProjectZip(project(),scene);download(blob,name+'.revolum.zip');
  }else{download(await engine.exportScene(format),name+'.'+format)}
  toast('Файл подготовлен к скачиванию','success');
}catch(error){toast('Ошибка экспорта: '+error.message,'error')}finally{setBusy(false)}}
async function restoreFromZip(file){if(!file)return;setBusy(true);try{const data=await importProjectZip(file);if(!canDiscardSplat())return;commitHistory();await restoreSnapshot(data,true)}catch(error){toast('Не удалось открыть проект: '+error.message,'error')}finally{setBusy(false);$('project-file').value=''}}
async function renderLibrary(){
 const list=$('library-list');list.replaceChildren();
 try{
   const projects=await listNamedProjects();
   if(!projects.length){const empty=document.createElement('p');empty.className='quality-note';empty.textContent='Именованных копий пока нет. Сохраните текущий проект, чтобы он появился здесь.';list.append(empty);return}
   for(const item of projects){
     const row=document.createElement('div');row.className='library-entry';
     const info=document.createElement('div');info.className='library-entry-info';
     const name=document.createElement('strong');name.textContent=item.name;name.title=item.name;
     const meta=document.createElement('small');meta.textContent=new Date(item.savedAt).toLocaleString('ru-RU')+' · '+item.objects+' объектов · '+item.photos+' фото';
     info.append(name,meta);row.append(info);
     const open=document.createElement('button');open.type='button';open.className='btn btn-outline';open.innerHTML='<i data-lucide="folder-open"></i> Открыть';
     open.onclick=async()=>{
       if(state.busy||!confirm('Открыть «'+item.name+'»? Текущий проект будет заменён, автосохранение обновится.')||!canDiscardSplat())return;
       setBusy(true);try{
         const snapshot=await loadNamedProject(item.id);if(!snapshot)throw Error('Проект не найден');
         commitHistory();await restoreSnapshot(snapshot,true);$('library-dialog').close();
       }catch(error){toast('Не удалось открыть копию: '+error.message,'error')}finally{setBusy(false)}
     };
     const remove=document.createElement('button');remove.type='button';remove.className='icon-btn library-remove';remove.title='Удалить копию';remove.setAttribute('aria-label','Удалить '+item.name);remove.innerHTML='<i data-lucide="trash-2"></i>';
     remove.onclick=async()=>{
       if(state.busy||!confirm('Удалить локальную копию «'+item.name+'» без возможности восстановления?'))return;
       setBusy(true);try{await deleteNamedProject(item.id);await renderLibrary();toast('Копия удалена','success')}catch(error){toast(error.message,'error')}finally{setBusy(false)}
     };
     row.append(open,remove);list.append(row);
   }
   icons();
 }catch(error){const note=document.createElement('p');note.className='quality-note';note.textContent='Не удалось загрузить библиотеку: '+error.message;list.append(note)}
}
async function saveLibraryCopy(){
 if(state.busy)return;setBusy(true);
 try{const saved=await saveNamedProject(project());await renderLibrary();toast('Сохранена копия «'+saved.name+'»','success')}
 catch(error){toast('Ошибка сохранения: '+error.message,'error')}finally{setBusy(false)}
}
function confirmReset(){if(!confirm('Очистить текущую сцену и фотосет? Сначала сохраните ZIP, если нужна резервная копия.')||!canDiscardSplat())return;if(multiview){multiview.reset().catch(console.warn);multiview=null;resetMultiviewUi()}commitHistory();state.loading=true;engine.clear();clearPhotos();state.name='Untitled scan';$('project-name').value=state.name;state.loading=false;setMode('object');renderAll();queueSave()}
async function processSelectedMesh(method){
  const id=engine.selectedId;
  if(state.busy||!engine.getEditableMesh(id))return;
  const before=capture();setBusy(true);
  $('mesh-tool-status').textContent=method==='simplify'?'Упрощение сетки в Worker…':method==='qem'?'QEM: проверка и схлопывание внутренних рёбер…':'Согласование ориентации граней в Worker…';
  try{
    const value=method==='qem'?Number($('mesh-qem-ratio').value):Number($('mesh-cell').value);
    const report=await engine.processMesh(id,method,value);
    commitHistory(before);renderInspector();queueSave();
    const result=report.sourceTriangles+' → '+report.triangles+' треугольников';
    toast((method==='orient'?'Ориентация обработана: ':method==='qem'?'QEM: ':'Mesh упрощён: ')+result+(report.limitReached?' (достигнут безопасный предел)':''),'success');
  }catch(error){
    $('mesh-tool-status').textContent='Операция не выполнена: '+error.message;
    toast('Mesh: '+error.message,'error');
  }finally{setBusy(false)}
}
async function auditSelectedMesh(){
 const id=engine.selectedId;if(state.busy||!engine.getEditableMesh(id))return;
 setBusy(true);$('mesh-tool-status').textContent='Анализ топологии и самопересечений в Worker…';
 try{
  const report=await engine.auditEditableMesh(id);
  renderInspector();queueSave();
  toast('Диагностика выполнена: '+report.intersection.status+' · '+report.intersection.testedPairs.toLocaleString('ru-RU')+' пар','success');
 }catch(error){$('mesh-tool-status').textContent='Аудит: '+error.message;toast('Аудит Mesh: '+error.message,'error')}
 finally{setBusy(false)}
}
async function reduceCloud(){
  const id=engine.selectedId;if(state.busy||!engine.getPointCloud(id))return;
  const before=capture();setBusy(true);
  try{
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const result=engine.reducePointCloud(id,Number($('cloud-voxel').value));
    commitHistory(before);renderInspector();queueSave();
    toast('Облако прорежено: '+result.sourceCount.toLocaleString('ru-RU')+' → '+result.remaining.toLocaleString('ru-RU')+' точек. ZIP и Undo сохраняют результат.','success');
  }catch(error){toast('Прореживание: '+error.message,'error')}
  finally{setBusy(false)}
}
function removeObject(){if(!engine.selectedId)return;commitHistory();engine.remove(engine.selectedId);renderInspector();queueSave()}
function demo(){state.loading=true;const knot=engine.addPrimitive('knot',{name:'Demo / Sculpted form',silent:true});engine.applyTransform(knot.id,{position:[0,.18,0],rotation:[.3,.2,0],scale:[1,1,1]},false);const base=engine.addPrimitive('cylinder',{name:'Demo / Pedestal',silent:true});engine.applyTransform(base.id,{position:[0,-1.06,0],rotation:[0,0,0],scale:[1.55,.13,1.55]},false);engine.select(knot.id);engine.frame();state.loading=false;renderAll()}
function keyboard(event){
  if(state.busy)return;
  const focus=document.activeElement;
  if(focus?.matches('input,textarea,[contenteditable]')||document.querySelector('dialog[open]'))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();return}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();return}
  if(state.mode!=='object')return;
  if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();removeObject()}
  if(event.key.toLowerCase()==='f')engine.frame(engine.selectedId);
  const map={g:'translate',r:'rotate',s:'scale'};const mode=map[event.key.toLowerCase()];if(mode)setTool(mode);
}
function setTool(mode){engine.setTool(mode);for(const [key,m] of [['move','translate'],['rotate','rotate'],['scale','scale']])$('tool-'+key).classList.toggle('active',mode===m)}
function bind(){
  $('mode-object').onclick=()=>setMode('object');$('mode-photos').onclick=()=>setMode('photos');
  for(const id of ['import-model-btn','empty-import-btn'])$(id).onclick=()=>$('model-file').click();
  for(const id of ['import-photos-btn','photo-import-hero','photo-add-inline','dock-add-btn'])$(id).onclick=()=>$('photo-file').click();
  $('model-file').onchange=async e=>{await addModels(e.target.files);e.target.value=''};
  $('import-model-folder-btn').onclick=()=>$('model-folder').click();
  $('model-folder').onchange=async e=>{await addModels(e.target.files);e.target.value=''};
  $('photo-file').onchange=async e=>{await addPhotos(e.target.files);e.target.value=''};
  $('project-file').onchange=e=>restoreFromZip(e.target.files[0]);
  $('library-btn').onclick=()=>{$('library-dialog').showModal();renderLibrary()};
  $('library-close-btn').onclick=()=>$('library-dialog').close();
  $('library-save-btn').onclick=saveLibraryCopy;
  $('reconstruct-selected').onclick=reconstructSelectedPhoto;
  $('mv-start').onclick=startMultiview;
  $('mv-download-diagnostic').onclick=()=>download(new Blob([JSON.stringify(scanDiagnostic(),null,2)],{type:'application/json'}),'revolum-sfm-diagnostic-'+APP_BUILD+'.json');
  $('mvs-start').onclick=startDenseMesh;
  $('mvs-cancel').onclick=cancelDenseMesh;
  $('mvs-download-glb').onclick=()=>{if(denseExport)download(denseExport.glb,denseExport.name+'-dense.glb')};
  $('mvs-download-ply').onclick=()=>{if(denseExport)download(denseExport.ply,denseExport.name+'-dense.ply')};
  $('mvs-download-report').onclick=()=>{if(!denseExport)return;const report={format:'revolum-mesh-diagnostics',version:1,source:'depth-assisted multi-view TSDF',scale:'arbitrary',printReady:false,stats:denseExport.stats};download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),denseExport.name+'-mesh-report.json')};
  $('mv-cancel').onclick=cancelMultiview;
  $('mv-export-bundle').onclick=exportMultiviewBundle;
  $('mv-new').onclick=newMultiview;
  $('mv-pause').onclick=()=>{multiview?.pause();multiviewButtons()};
  $('mv-resume').onclick=()=>{try{multiview?.resume();mvExported=false;multiviewButtons()}catch(e){toast(e.message,'error')}};
  $('mv-finish').onclick=async()=>{try{await multiview?.finish();multiviewButtons()}catch(e){toast(e.message,'error')}};
  $('mv-camera').onchange=e=>{try{multiview?.selectCamera(e.target.value)}catch(error){toast(error.message,'error')}};
  const splatCanvas=$('mv-canvas');let splatPointer=null;
  splatCanvas.addEventListener('pointerdown',e=>{if(!multiview?.ready||e.button!==0)return;splatPointer=[e.clientX,e.clientY,e.pointerId];splatCanvas.setPointerCapture(e.pointerId)});
  splatCanvas.addEventListener('pointermove',e=>{if(!splatPointer||splatPointer[2]!==e.pointerId)return;const dx=e.clientX-splatPointer[0],dy=e.clientY-splatPointer[1];splatPointer=[e.clientX,e.clientY,e.pointerId];multiview?.orbit(dx,dy)});
  const releaseSplat=e=>{if(splatPointer?.[2]===e.pointerId)splatPointer=null};splatCanvas.addEventListener('pointerup',releaseSplat);splatCanvas.addEventListener('pointercancel',releaseSplat);
  splatCanvas.addEventListener('wheel',e=>{if(!multiview?.ready)return;e.preventDefault();multiview.orbit(0,0,e.deltaY)},{passive:false});
  for(const kind of ['ply','cloud','cameras'])$('mv-export-'+kind).onclick=()=>downloadMultiview(kind);
  $('mv-cloud-to-scene').onclick=addSparseToScene;
  $('reconstruct-cancel').onclick=()=>{if(!state.depthRunning)return;state.depthRunning=false;cancelDepth();$('reconstruct-status').textContent='Реконструкция отменена. Уже созданные модели сохранены.';}
  $('import-cancel-btn').onclick=()=>{state.importController?.abort();$('import-cancel-btn').disabled=true;$('import-status-text').textContent='Остановка после текущего файла…'};
  $('video-import-btn').onclick=()=>$('video-file').click();
  $('video-file').onchange=e=>importVideo(e.target.files[0]);
  $('capture-cancel-btn').onclick=()=>videoController?.abort();
  $('camera-open-btn').onclick=openCamera;
  $('camera-close-btn').onclick=()=>$('camera-dialog').close();
  $('camera-dialog').addEventListener('close',stopCamera);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&$('camera-dialog').open)$('camera-dialog').close()});
  $('camera-shot-btn').onclick=shootCamera;
  $('open-zip-btn').onclick=()=>$('project-file').click();
  $('project-name').onchange=e=>{const name=e.target.value.trim()||'Untitled scan';if(name!==state.name){commitHistory();state.name=name;e.target.value=name;queueSave()}};
  $('new-btn').onclick=confirmReset;$('save-btn').onclick=()=>saveNow();$('restore-btn').onclick=async()=>{try{const record=await loadLocal();if(!record){toast('В этом браузере ещё нет сохранённого проекта');return}if(confirm('Открыть локальную копию? Текущие несохранённые изменения будут заменены.')&&canDiscardSplat()){commitHistory();await restoreSnapshot(record.project,true)}}catch(error){toast(error.message,'error')}};
  $('tool-move').onclick=()=>setTool('translate');$('tool-rotate').onclick=()=>setTool('rotate');$('tool-scale').onclick=()=>setTool('scale');$('add-shape').onclick=chooseShape;
  $('delete-object').onclick=removeObject;$('inspector-delete').onclick=removeObject;
  $('cloud-reduce').onclick=reduceCloud;
  $('mesh-simplify').onclick=()=>processSelectedMesh('simplify');
  $('mesh-orient').onclick=()=>processSelectedMesh('orient');
  $('mesh-qem').onclick=()=>processSelectedMesh('qem');
  $('mesh-audit').onclick=auditSelectedMesh;
  $('mesh-audit-download').onclick=()=>{const r=engine.items.get(engine.selectedId)?.meshAudit;if(r)download(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}),safeFilename(state.name)+'-mesh-audit.json')};
  $('frame-btn').onclick=()=>engine.frame(engine.selectedId);
  $('shot-btn').onclick=()=>{try{const data=engine.image();const a=document.createElement('a');a.href=data;a.download=safeFilename(state.name)+'-viewport.png';a.click()}catch(error){toast(error.message,'error')}};
  for(const btn of document.querySelectorAll('[data-view]'))btn.onclick=()=>{engine.view(btn.dataset.view);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===btn))};
  $('selected-name').onchange=e=>{if(!engine.selectedId)return;commitHistory();engine.rename(engine.selectedId,e.target.value);queueSave()};
  $('reset-transform').onclick=()=>{if(!engine.selectedId)return;commitHistory();engine.applyTransform(engine.selectedId,{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});renderInspector();queueSave()};
  for(const input of document.querySelectorAll('[data-vector]'))input.onchange=e=>{
    const id=engine.selectedId;if(!id)return;const n=Number(e.target.value);if(!Number.isFinite(n))return;if(e.target.dataset.vector==='scale'&&Math.abs(n)<.0001){toast('Масштаб не может быть нулевым','error');renderInspector();return}
    const t=engine.getTransform(id),field=e.target.dataset.vector,axis={x:0,y:1,z:2}[e.target.dataset.axis];
    const value=field==='rotation'?n*Math.PI/180:n;if(t[field][axis]===value)return;commitHistory();t[field][axis]=value;engine.applyTransform(id,t);renderInspector();queueSave();
  };
  $('export-btn').onclick=()=>$('export-dialog').showModal();$('help-btn').onclick=()=>$('help-dialog').showModal();
  document.querySelectorAll('[data-export]').forEach(btn=>btn.onclick=()=>doExport(btn.dataset.export));
  $('analyze-btn').onclick=()=>{renderPhotos();toast('Отчёт обновлён. Оценка экспозиции приблизительная.','success')};
  document.addEventListener('keydown',keyboard);
  window.addEventListener('beforeunload',event=>{if(mvPending||(multiview?.ready&&!mvExported)){event.preventDefault();event.returnValue=''}});
  const area=$('editor-area');let dragDepth=0;
  area.addEventListener('dragenter',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();dragDepth++;if(state.mode==='object')$('drop-overlay').classList.remove('hidden')});
  area.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy'}});
  area.addEventListener('dragleave',e=>{e.preventDefault();dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('drop-overlay').classList.add('hidden')});
  area.addEventListener('drop',async e=>{e.preventDefault();dragDepth=0;$('drop-overlay').classList.add('hidden');const files=[...e.dataTransfer.files];const photos=files.filter(isPhoto),models=files.filter(f=>MODEL_EXTENSIONS.includes(f.name.toLowerCase().split('.').pop())),videos=files.filter(f=>/\.(mp4|webm|mov)$/i.test(f.name));if(models.length)await addModels(files);else if(photos.length)await addPhotos(photos);if(videos.length)await importVideo(videos[0])});
}
async function init(){
  try{engine=new Studio3D($('viewport'),{onSelect:()=>{renderScene();renderInspector()},onChange:()=>{if(!state.loading){renderScene();renderInspector();queueSave()}},onTransformStart:()=>{state.transformStart={before:capture(),id:engine.selectedId,transform:engine.getTransform(engine.selectedId)}},onTransformEnd:()=>{const start=state.transformStart;state.transformStart=null;if(start&&JSON.stringify(engine.getTransform(start.id))!==JSON.stringify(start.transform)){commitHistory(start.before);queueSave()}},onTransform:renderInspector,onError:m=>toast(m,'error')})}
  catch(error){toast('3D-движок не запустился: '+error.message,'error');console.error(error);return}
  bind();try{const local=await loadLocal();if(local?.project){await restoreSnapshot(local.project);status('Открыт локально')}else demo()}catch(error){console.warn('Local restore:',error);demo();toast('Локальное сохранение недоступно: '+error.message,'error')}
  renderAll();resetMultiviewUi();icons();
}
init();
