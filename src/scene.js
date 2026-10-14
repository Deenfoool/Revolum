import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

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
    if(ext==='glb'||ext==='gltf') {
      const data=ext==='glb'?await file.arrayBuffer():await file.text();
      const parsed=await new Promise((resolve,reject)=>new GLTFLoader().parse(data,'',resolve,reject));
      object=parsed.scene;
    } else if(ext==='obj') {
      object=new OBJLoader().parse(await file.text());
      object.traverse(o=>{if(o.isMesh){o.material=new THREE.MeshStandardMaterial({color:0xabbde7,roughness:.65,side:THREE.DoubleSide});}});
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
    const root=new THREE.Group();root.add(object);
    const item=this._register(root,{...options,kind:'model',name:options.name||file.name.replace(/\.[^.]+$/,''),sourceFile:file});
    if(options.transform)this.applyTransform(item.id,options.transform,false);
    if(!options.silent){this.select(item.id);this.frame(item.id)}
    return item;
  }
  rename(id,name){const item=this.items.get(id);if(!item)return;item.name=(name||'Object').trim().slice(0,70);item.root.name=item.name;this.notify()}
  select(id){if(id&&!this.items.has(id))id=null;this.selectedId=id;this.transform.detach();if(id)this.transform.attach(this.items.get(id).root);this.hooks.onSelect?.(id)}
  remove(id){const item=this.items.get(id);if(!item)return;if(this.selectedId===id)this.select(null);this.content.remove(item.root);disposeTree(item.root);this.items.delete(id);this.notify()}
  clear(){this.select(null);for(const id of [...this.items.keys()])this.remove(id)}
  applyTransform(id,t,notify=true){const root=this.items.get(id)?.root;if(!root)return;root.position.fromArray(t.position||[0,0,0]);root.rotation.set(...(t.rotation||[0,0,0]));root.scale.fromArray(t.scale||[1,1,1]);if(notify)this.notify()}
  getTransform(id){const o=this.items.get(id)?.root;if(!o)return null;return {position:o.position.toArray(),rotation:[o.rotation.x,o.rotation.y,o.rotation.z],scale:o.scale.toArray()}}
  measure(id){const item=this.items.get(id);if(!item)return null;let meshes=0,triangles=0;item.root.traverse(o=>{if(o.isMesh){meshes++;const g=o.geometry;triangles+=g.index?g.index.count/3:(g.getAttribute('position')?.count||0)/3}});const box=new THREE.Box3().setFromObject(item.root);const s=box.isEmpty()?new THREE.Vector3():box.getSize(new THREE.Vector3());return {meshes,triangles:Math.round(triangles),size:s.toArray()}}
  frame(id=null){const root=id?this.items.get(id)?.root:this.content;if(!root)return;const box=new THREE.Box3().setFromObject(root);if(box.isEmpty())return;const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const distance=Math.max(size.length()*1.1,.65);const direction=this.camera.position.clone().sub(this.orbit.target).normalize();this.orbit.target.copy(center);this.camera.position.copy(center).addScaledVector(direction,distance);this.camera.near=Math.max(.005,distance/2000);this.camera.far=Math.max(300,distance*20);this.camera.updateProjectionMatrix();this.orbit.update()}
  view(type){const center=this.orbit.target.clone(),distance=Math.max(this.camera.position.distanceTo(center),4);const v={front:[0,0,1],right:[1,0,0],top:[0,1,.00001],perspective:[1,.7,1]}[type];if(!v)return;const direction=new THREE.Vector3(...v).normalize();this.camera.position.copy(center).addScaledVector(direction,distance);this.camera.up.set(0,1,0);this.camera.lookAt(center);this.orbit.update()}
  setTool(mode){this.transform.setMode(mode)}
  image(){return this.renderer.domElement.toDataURL('image/png')}
  snapshot(){return [...this.items.values()].map(item=>({id:item.id,name:item.name,kind:item.kind,primitive:item.primitive||null,sourceFile:item.sourceFile||null,transform:this.getTransform(item.id)}))}
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