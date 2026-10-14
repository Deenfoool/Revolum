import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import {selectVoxelPoints,encodeCloudPly} from './pointcloud.js';
import {runMeshOperation} from './mesh-operations.js';

export const MODEL_EXTENSIONS = ['glb','gltf','obj','stl','ply'];
const uuid = () => crypto.randomUUID?.() || 'r-' + Date.now() + '-' + Math.random().toString(36).slice(2);
const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
const extension = name => name.toLowerCase().split('.').pop();
function disposeTree(root) {
  root.traverse(o => {
    if(o.geometry) o.geometry.dispose();
    if(o.material) for(const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      for(const k of Object.keys(m)) if(m[k]?.isTexture) m[k].dispose();
      m.dispose();
    }
  });
}
function createGeometry(type) {
  switch(type) {
    case 'box': return new THREE.BoxGeometry(1.8,1.8,1.8);
    case 'sphere': return new THREE.SphereGeometry(1.13,40,24);
    case 'cylinder': return new THREE.CylinderGeometry(.9,.9,1.8,48);
    case 'torus': return new THREE.TorusGeometry(1.05,.3,18,72);
    case 'knot': return new THREE.TorusKnotGeometry(.95,.28,160,22,2,3);
    default: throw Error('Неизвестная фигура: ' + type);
  }
}
export class Studio3D {
  constructor(container, hooks={}) {
    this.container=container; this.hooks=hooks; this.items=new Map(); this.selectedId=null;
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color('#111824');
    this.scene.fog=new THREE.FogExp2('#111824',.015);
    this.content=new THREE.Group(); this.content.name='Revolum content'; this.scene.add(this.content);
    this.camera=new THREE.PerspectiveCamera(42,1,.01,2500); this.camera.position.set(6,4.3,7);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure=1.45;
    container.appendChild(this.renderer.domElement);
    const ambient=new THREE.HemisphereLight(0xdce6ff,0x37435a,2.1);this.scene.add(ambient);
    const key=new THREE.DirectionalLight(0xb8cbff,3.0); key.position.set(5,10,7);this.scene.add(key);
    const rim=new THREE.DirectionalLight(0x7b78ff,2);rim.position.set(-6,4,-4);this.scene.add(rim);
    this.grid=new THREE.GridHelper(60,60,0x44536b,0x273344);this.grid.position.y=-1.25;
    this.grid.material.transparent=true;this.grid.material.opacity=.45;this.scene.add(this.grid);
    this.orbit=new OrbitControls(this.camera,this.renderer.domElement);
    this.orbit.enableDamping=true;this.orbit.dampingFactor=.07;
    this.orbit.minDistance=.2;this.orbit.maxDistance=500;
    this.orbit.target.set(0,.1,0);
    this.transform=new TransformControls(this.camera,this.renderer.domElement);
    this.transform.setSize(.8);this.scene.add(this.transform.getHelper());
    this.transform.addEventListener('dragging-changed',event=>{this.orbit.enabled=!event.value;});
    this.transform.addEventListener('mouseDown',()=>this.hooks.onTransformStart?.());
    this.transform.addEventListener('mouseUp',()=>this.hooks.onTransformEnd?.());
    this.transform.addEventListener('objectChange',()=>this.hooks.onTransform?.());
    const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
    let start=null;
    this.renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)start=[e.clientX,e.clientY]});
    this.renderer.domElement.addEventListener('pointerup',e=>{
      if(!start||e.button!==0)return;
      const distance=Math.hypot(e.clientX-start[0],e.clientY-start[1]);start=null;
      if(distance>5||this.transform.dragging)return;
      const rect=this.renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);
      ray.setFromCamera(pointer,this.camera);
      const found=ray.intersectObjects(this.content.children,true)[0];
      let root=found?.object;
      while(root&&root.parent!==this.content)root=root.parent;
      this.select(root?.userData.revolumId||null);
    });
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);
    this.resize();this.running=true;
    const draw=()=>{if(!this.running)return;this.orbit.update();this.renderer.render(this.scene,this.camera);requestAnimationFrame(draw)};draw();
  }
  resize(){const {width,height}=this.container.getBoundingClientRect();if(width<1||height<1)return;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false)}
  notify(){this.hooks.onChange?.()}
  _register(root,meta) {
    const id=meta.id||uuid();root.userData.revolumId=id;root.name=meta.name||'Object';
    const item={...meta,id,root,name:root.name};this.items.set(id,item);this.content.add(root);
    this.notify();return item;
  }
  addPrimitive(type='box',options={}) {
    const root=new THREE.Group();
    const material=new THREE.MeshStandardMaterial({color:type==='knot'?0xa6baff:0x8fa8de,metalness:.3,roughness:.31});
    const mesh=new THREE.Mesh(createGeometry(type),material);mesh.castShadow=true;root.add(mesh);
    root.position.set(0,type==='knot'?.25:0,0);
    const item=this._register(root,{...options,kind:'primitive',primitive:type,name:options.name||type[0].toUpperCase()+type.slice(1)});
    if(options.transform)this.applyTransform(item.id,options.transform,false);
    if(!options.silent)this.select(item.id);
    return item;
  }
  async importFile(file,options={}) {
    const ext=extension(file.name);if(!MODEL_EXTENSIONS.includes(ext))throw Error('Формат .' + ext + ' не поддерживается');
    if(file.size>400*1024*1024)throw Error('Один файл не должен превышать 400 МБ');
    let object;
    const resourceFiles=options.resourceFiles||[];
    const resourceMap=new Map(),resourceUrls=[];
    for(const asset of resourceFiles){
      const key=asset.name.toLowerCase();
      if(resourceMap.has(key)&&resourceMap.get(key)!==asset)throw Error('В наборе два ресурса с именем '+asset.name+'. Разделите наборы моделей.');
      resourceMap.set(key,asset);
    }
    const keyFromUri=uri=>{let path=uri.split(/[?#]/)[0];try{path=decodeURIComponent(path)}catch{}return path.split(/[\\/]/).pop().toLowerCase()};
    const manager=new THREE.LoadingManager();
    const cache=new Map();
    manager.setURLModifier(uri=>{
      if(/^(blob:|data:)/i.test(uri))return uri;
      const key=keyFromUri(uri),asset=resourceMap.get(key);
      if(!asset)return uri;
      if(!cache.has(key)){const blobUrl=URL.createObjectURL(asset);cache.set(key,blobUrl);resourceUrls.push(blobUrl)}
      return cache.get(key);
    });
    try {
      if(ext==='glb'||ext==='gltf') {
        const data=ext==='glb'?await file.arrayBuffer():await file.text();
        if(ext==='gltf') {
          let json;try{json=JSON.parse(data)}catch{throw Error('Некорректный JSON glTF')}
          const deps=[...(json.buffers||[]),...(json.images||[])].map(x=>x.uri).filter(Boolean).filter(uri=>!/^data:/i.test(uri));
          const missing=deps.filter(uri=>!resourceMap.has(keyFromUri(uri)));
          if(missing.length)throw Error('Не найдены связанные файлы: '+missing.join(', ')+'. Выберите glTF, BIN и текстуры вместе.');
        }
        const parsed=await new Promise((resolve,reject)=>new GLTFLoader(manager).parse(data,'',resolve,reject));
        object=parsed.scene;
      } else if(ext==='obj') {
        const objText=await file.text(),mtlName=objText.match(/^\s*mtllib\s+([^\r\n]+)\s*$/mi)?.[1]?.trim();
        const loader=new OBJLoader(manager);
        if(mtlName){
          const mtl=resourceMap.get(keyFromUri(mtlName));
          if(!mtl)throw Error('Для этого OBJ требуется '+mtlName+'. Выберите OBJ, MTL и текстуры вместе.');
          const materials=new MTLLoader(manager).parse(await mtl.text(),'');
          materials.preload();loader.setMaterials(materials);
        }
        object=loader.parse(objText);
        if(!mtlName)object.traverse(o=>{if(o.isMesh){o.material=new THREE.MeshStandardMaterial({color:0xabbde7,roughness:.65,side:THREE.DoubleSide})}});
    } else if(ext==='stl') {
      const geometry=new STLLoader().parse(await file.arrayBuffer());
      object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xadc0ec,roughness:.58,metalness:.06,side:THREE.DoubleSide}));
    } else {
      const bytes=await file.arrayBuffer();
      const header=new TextDecoder().decode(bytes.slice(0,Math.min(bytes.byteLength,8192)));
      const faceMatch=header.match(/element face\s+(\d+)/);
      const geometry=new PLYLoader().parse(bytes);
      const vertexColors=!!geometry.getAttribute('color');
      if(!faceMatch||Number(faceMatch[1])===0) {
        object=new THREE.Points(geometry,new THREE.PointsMaterial({size:.035,sizeAttenuation:true,color:0xffffff,vertexColors}));
      } else {
        if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
        object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xffffff,vertexColors,roughness:.85,side:THREE.DoubleSide}));
      }
    }
    } catch(error) {for(const url of resourceUrls)URL.revokeObjectURL(url);throw error}
    const root=new THREE.Group();root.add(object);
    const item=this._register(root,{...options,resourceFiles,resourceUrls,kind:'model',name:options.name||file.name.replace(/\.[^.]+$/,''),sourceFile:file});
    if(options.transform)this.applyTransform(item.id,options.transform,false);
    if(!options.silent){this.select(item.id);this.frame(item.id)}
    return item;
  }
  async addDepthReconstruction({geometry,texture,name,sourcePhoto}){
    const material=new THREE.MeshStandardMaterial({map:texture,metalness:0,roughness:1,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Predicted visible surface';
    const root=new THREE.Group();root.name=name;root.add(mesh);
    let binary;
    try{binary=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true,maxTextureSize:2048})}
    catch(error){disposeTree(root);throw Error('Не удалось сохранить реконструкцию в GLB: '+error.message)}
    const safe=(name||'depth-mesh').replace(/[^a-z0-9а-яё_-]+/gi,'-').slice(0,70)||'depth-mesh';
    const sourceFile=new File([binary],safe+'.glb',{type:'model/gltf-binary'});
    const item=this._register(root,{kind:'model',name,sourceFile,method:'monocular-depth'});
    this.select(item.id);this.frame(item.id);return item;
  }
  async addDenseMesh({positions,indices,colors,name='Multi-view / Dense Mesh'}){
    if(!positions?.length||positions.length%3||positions.length>1500000||!indices?.length||indices.length%3||indices.length>1200000||colors?.length!==positions.length)throw Error('Неверная геометрия плотного Mesh');
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    geometry.setIndex(new THREE.BufferAttribute(indices,1));
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const material=new THREE.MeshStandardMaterial({vertexColors:true,metalness:0,roughness:.92,side:THREE.DoubleSide});
    const root=new THREE.Group();root.name=name;
    const mesh=new THREE.Mesh(geometry,material);mesh.name='SfM-aligned multi-view TSDF surface';root.add(mesh);
    let binary;try{binary=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true})}
    catch(error){disposeTree(root);throw Error('Ошибка кодирования GLB: '+error.message)}
    const sourceFile=new File([binary],(name||'dense-mesh').replace(/[^a-z0-9а-яё_-]+/gi,'-').slice(0,64)+'.glb',{type:'model/gltf-binary'});
    const item=this._register(root,{kind:'model',name,sourceFile,method:'multiview-depth-tsdf'});
    this.select(item.id);this.frame(item.id);return item;
  }
  rename(id,name){const item=this.items.get(id);if(!item)return;item.name=(name||'Object').trim().slice(0,70);item.root.name=item.name;this.notify()}
  select(id){if(id&&!this.items.has(id))id=null;this.selectedId=id;this.transform.detach();if(id)this.transform.attach(this.items.get(id).root);this.hooks.onSelect?.(id)}
  remove(id){const item=this.items.get(id);if(!item)return;if(this.selectedId===id)this.select(null);this.content.remove(item.root);disposeTree(item.root);for(const url of item.resourceUrls||[])URL.revokeObjectURL(url);this.items.delete(id);this.notify()}
  clear(){this.select(null);for(const id of [...this.items.keys()])this.remove(id)}
  applyTransform(id,t,notify=true){const root=this.items.get(id)?.root;if(!root)return;root.position.fromArray(t.position||[0,0,0]);root.rotation.set(...(t.rotation||[0,0,0]));root.scale.fromArray(t.scale||[1,1,1]);if(notify)this.notify()}
  getTransform(id){const o=this.items.get(id)?.root;if(!o)return null;return {position:o.position.toArray(),rotation:[o.rotation.x,o.rotation.y,o.rotation.z],scale:o.scale.toArray()}}
  getEditableMesh(id){
    const item=this.items.get(id);
    if(!item||!['multiview-depth-tsdf','mesh-processed'].includes(item.method))return null;
    const meshes=[];let hasOther=false;
    item.root.traverse(o=>{if(o.isMesh)meshes.push(o);else if(o.isPoints||o.isSkinnedMesh)hasOther=true});
    if(meshes.length!==1||hasOther)return null;
    const mesh=meshes[0],geom=mesh.geometry;
    if(mesh.isSkinnedMesh||mesh.morphTargetInfluences?.length||!geom?.index||
       geom.getAttribute('position')?.itemSize!==3||geom.getAttribute('color')?.itemSize<3||
       geom.getAttribute('color')?.count!==geom.getAttribute('position')?.count||
       mesh.material?.map||Array.isArray(mesh.material))return null;
    return mesh;
  }
  async processMesh(id,method,cellRatio=.02){
    const item=this.items.get(id),mesh=this.getEditableMesh(id);
    if(!mesh)throw Error('Инструмент доступен для одиночного индексированного Dense Mesh с цветами вершин');
    const geom=mesh.geometry,attr=geom.getAttribute('position'),col=geom.getAttribute('color');
    const positions=new Float32Array(attr.count*3),colors=new Float32Array(attr.count*3);
    for(let i=0;i<attr.count;i++){
      positions[i*3]=attr.getX(i);positions[i*3+1]=attr.getY(i);positions[i*3+2]=attr.getZ(i);
      colors[i*3]=col.getX(i);colors[i*3+1]=col.getY(i);colors[i*3+2]=col.getZ(i);
    }
    const source={positions,colors,indices:Uint32Array.from(geom.index.array)};
    const result=await runMeshOperation(source,method,cellRatio);
    const next=new THREE.BufferGeometry();
    next.setAttribute('position',new THREE.BufferAttribute(result.positions,3));
    next.setAttribute('color',new THREE.BufferAttribute(result.colors,3));
    next.setIndex(new THREE.BufferAttribute(result.indices,1));
    next.computeVertexNormals();next.computeBoundingBox();next.computeBoundingSphere();
    // Serialize a clone with root's *editor transform removed*. Snapshots keep
    // this transform separately; including it in GLB would double-apply on restore.
    const exportRoot=item.root.clone(true);
    exportRoot.position.set(0,0,0);exportRoot.rotation.set(0,0,0);exportRoot.scale.set(1,1,1);
    let exportMesh=null;exportRoot.traverse(o=>{if(o.isMesh)exportMesh=o});
    if(!exportMesh){next.dispose();throw Error('Mesh отсутствует в клоне для экспорта')}
    exportMesh.geometry=next;
    let binary;
    try{binary=await new GLTFExporter().parseAsync(exportRoot,{binary:true,onlyVisible:true})}
    catch(error){next.dispose();throw Error('Не удалось закодировать обновлённую модель в GLB: '+error.message)}
    const safe=(item.name||'edited-mesh').replace(/[^a-z0-9а-яё_-]+/gi,'-').slice(0,60)||'mesh';
    const sourceFile=new File([binary],safe+'-edited.glb',{type:'model/gltf-binary'});
    const old=mesh.geometry;mesh.geometry=next;item.sourceFile=sourceFile;
    item.method='mesh-processed';item.meshReport={...result.operation,quality:result.quality};
    old.dispose();this.notify();
    return item.meshReport;
  }
  getPointCloud(id){
    const item=this.items.get(id),root=item?.root;
    return root?.children?.length===1&&root.children[0].isPoints&&item.sourceFile?.name?.toLowerCase().endsWith('.ply')?root.children[0]:null;
  }
  reducePointCloud(id,fraction=.025){
    const item=this.items.get(id),cloud=this.getPointCloud(id);
    if(!item||!cloud)throw Error('Выберите импортированное облако точек PLY');
    const position=cloud.geometry.getAttribute('position');
    if(!position||position.itemSize!==3)throw Error('Неверный формат координат');
    const raw=new Float32Array(position.count*3);
    for(let i=0;i<position.count;i++){raw[i*3]=position.getX(i);raw[i*3+1]=position.getY(i);raw[i*3+2]=position.getZ(i)}
    const result=selectVoxelPoints(raw,{fraction});
    if(result.remaining===result.sourceCount)throw Error('Размер вокселя слишком мал: число точек не изменилось. Выберите более сильное прореживание.');
    const attr=cloud.geometry.getAttribute('color'),colors=attr&&attr.itemSize>=3&&attr.count===position.count?new Float32Array(raw.length):null;
    if(colors)for(let i=0;i<position.count;i++){colors[i*3]=attr.getX(i);colors[i*3+1]=attr.getY(i);colors[i*3+2]=attr.getZ(i)}
    const ply=encodeCloudPly(raw,result.indices,colors),points=new Float32Array(result.remaining*3),rgb=colors?new Float32Array(result.remaining*3):null;
    for(let i=0;i<result.remaining;i++){const src=result.indices[i]*3;points.set(raw.subarray(src,src+3),i*3);if(rgb)rgb.set(colors.subarray(src,src+3),i*3)}
    const next=new THREE.BufferGeometry();next.setAttribute('position',new THREE.BufferAttribute(points,3));if(rgb)next.setAttribute('color',new THREE.BufferAttribute(rgb,3));next.computeBoundingSphere();next.computeBoundingBox();
    const sourceName=item.sourceFile.name.replace(/\.ply$/i,'').replace(/[^a-z0-9а-яё_-]+/gi,'-').slice(0,65)||'cloud';
    const original=cloud.geometry;cloud.geometry=next;item.sourceFile=new File([ply],sourceName+'-voxel.ply',{type:'application/octet-stream'});item.method='voxel-filtered';original.dispose();this.notify();
    return result;
  }
  measure(id){const item=this.items.get(id);if(!item)return null;let meshes=0,triangles=0,points=0;item.root.traverse(o=>{if(o.isMesh){meshes++;const g=o.geometry;triangles+=g.index?g.index.count/3:(g.getAttribute('position')?.count||0)/3}else if(o.isPoints){points+=o.geometry.getAttribute('position')?.count||0}});const box=new THREE.Box3().setFromObject(item.root);const s=box.isEmpty()?new THREE.Vector3():box.getSize(new THREE.Vector3());return {meshes,triangles:Math.round(triangles),points,size:s.toArray()}}
  frame(id=null){const root=id?this.items.get(id)?.root:this.content;if(!root)return;const box=new THREE.Box3().setFromObject(root);if(box.isEmpty())return;const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const distance=Math.max(size.length()*1.1,.65);const direction=this.camera.position.clone().sub(this.orbit.target).normalize();this.orbit.target.copy(center);this.camera.position.copy(center).addScaledVector(direction,distance);this.camera.near=Math.max(.005,distance/2000);this.camera.far=Math.max(300,distance*20);this.camera.updateProjectionMatrix();this.orbit.update()}
  view(type){const center=this.orbit.target.clone(),distance=Math.max(this.camera.position.distanceTo(center),4);const v={front:[0,0,1],right:[1,0,0],top:[0,1,.00001],perspective:[1,.7,1]}[type];if(!v)return;const direction=new THREE.Vector3(...v).normalize();this.camera.position.copy(center).addScaledVector(direction,distance);this.camera.up.set(0,1,0);this.camera.lookAt(center);this.orbit.update()}
  setTool(mode){this.transform.setMode(mode)}
  image(){return this.renderer.domElement.toDataURL('image/png')}
  snapshot(){return [...this.items.values()].map(item=>({id:item.id,name:item.name,kind:item.kind,primitive:item.primitive||null,sourceFile:item.sourceFile||null,resourceFiles:item.resourceFiles||[],method:item.method||null,meshReport:item.meshReport||null,transform:this.getTransform(item.id)}))}
  async restore(items=[]){this.clear();for(const item of items){try{if(item.kind==='model'&&item.sourceFile)await this.importFile(item.sourceFile,{...item,silent:true});else if(item.kind==='primitive')this.addPrimitive(item.primitive,{...item,silent:true});}catch(error){this.hooks.onError?.('Не удалось восстановить '+item.name+': '+error.message)}}this.select(null);this.frame()}
  async exportScene(format) {
    if(!this.items.size)throw Error('В сцене пока нет объектов');
    if(format==='glb')return new Blob([await new GLTFExporter().parseAsync(this.content,{binary:true,onlyVisible:true})],{type:'model/gltf-binary'});
    if(![...this.content.children].some(root=>{let found=false;root.traverse(o=>{if(o.isMesh)found=true});return found}))throw Error('В сцене нет полигональных объектов для экспорта');
    if(format==='obj')return new Blob([new OBJExporter().parse(this.content)],{type:'text/plain;charset=utf-8'});
    if(format==='stl')return new Blob([new STLExporter().parse(this.content,{binary:true})],{type:'model/stl'});
    throw Error('Неизвестный формат экспорта');
  }
}