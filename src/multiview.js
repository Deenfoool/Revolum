// Revolum adapter for vendored Splat.js, MIT (Stratum1 GmbH).
// Full browser-only SfM + differentiable WebGPU Gaussian splat training.
// Local import is intentional: no remote reconstruction service or CDN at runtime.
import {createSession,camPosition} from '../vendor/splatjs/src/session.js?v=0.4.5-abortdiag';
import {sfmDiagnostics,scanBundle} from './scan-package.js';
import {planScanBudget} from './scan-budget.js';
import {acquireScanDevice,scanError} from './splat-preflight.js';

export function validateCapture(files){
  if(!Array.isArray(files)||files.length<8)throw Error('Для многокадрового скана нужно минимум 8 перекрывающихся фотографий');
  if(files.length>120)throw Error('В текущем режиме максимум 120 фотографий. Создайте меньший фотосет.');
  let total=0;
  for(const file of files){
    if(!file||!file.size||file.size>50*1024*1024)throw Error('Каждое фото должно быть доступным файлом размером до 50 МБ');
    total+=file.size;
  }
  if(total>1.2*1024**3)throw Error('Набор слишком велик (более 1.2 ГБ). Уменьшите фотографии.');
  return {count:files.length,totalBytes:total};
}
export function sparsePly(recon){
  const points=(recon?.points||[]).filter(p=>p?.X?.length===3&&p.X.every(Number.isFinite));
  if(!points.length)throw Error('SfM не вернул точек для экспорта');
  const lines=['ply','format ascii 1.0','comment Revolum SfM sparse point cloud; reconstruction scale arbitrary','element vertex '+points.length,'property float x','property float y','property float z','property uchar red','property uchar green','property uchar blue','end_header'];
  for(const p of points){
    const rgb=p.rgb||[.7,.7,.7];
    const toByte=x=>Math.max(0,Math.min(255,Math.round(Number.isFinite(x)?(x<=1?x*255:x):0)));
    lines.push(p.X.map(n=>n.toFixed(7)).join(' ')+' '+rgb.map(toByte).join(' '));
  }
  return new Blob([lines.join('\n')+'\n'],{type:'application/octet-stream'});
}
export function cameraReport(recon,frames){
  if(!recon?.cams?.length)throw Error('Нет рассчитанных камер');
  const cams=recon.cams.map(c=>({
    imageIndex:c.imgIdx,
    imageName:frames?.[c.imgIdx]?.name||'',
    R:Array.from(c.R),t:Array.from(c.t),
    center:camPosition(c),f:c.f,cx:c.cx,cy:c.cy,
    fyScale:c.aspect||1,
  }));
  return new Blob([JSON.stringify({format:'revolum-sfm',version:1,scale:'arbitrary (unscaled SfM)',registered:cams.length,cameras:cams},null,2)],{type:'application/json'});
}
export class MultiViewReconstruction{
  constructor({canvas,onUpdate=()=>{},onReady=()=>{},onComplete=()=>{},onError=()=>{}}){
    this.canvas=canvas;this.hooks={onUpdate,onReady,onComplete,onError};
    this.session=null;this.controller=null;this.phase='idle';this.pending=false;
    this.unsub=[];this.revision=0;this.orbitState=null;this.report=null;this.budget=null;this.device=null;this.cancelRequested=false;
  }
  emit(message,extra={}){this.hooks.onUpdate({message,phase:this.phase,...extra})}
  get ready(){return !!this.session?.trainer}
  get cameraCount(){return this.session?.trainer?.camMeta?.length||0}
  selectCamera(index){
    if(!this.ready)throw Error('Сначала постройте скан');
    const n=this.cameraCount,i=Math.floor(Number(index));
    if(!Number.isFinite(i)||i<0||i>=n)throw Error('Некорректный индекс камеры');
    const meta=this.session.view.lookThrough(i);
    const cloud=this.session.recon?.points||[];
    let center=[0,0,0],used=0;
    for(let n=0;n<cloud.length;n+=Math.max(1,Math.floor(cloud.length/8000))){
      const xyz=cloud[n]?.X;if(!xyz||xyz.length!==3||!xyz.every(Number.isFinite))continue;
      center[0]+=xyz[0];center[1]+=xyz[1];center[2]+=xyz[2];used++;
    }
    if(used)center=center.map(v=>v/used);
    const position=camPosition(meta);
    const up=[-meta.R[3],-meta.R[4],-meta.R[5]];
    const distance=Math.hypot(position[0]-center[0],position[1]-center[1],position[2]-center[2]);
    if(!Number.isFinite(distance)||distance<1e-3){
      const forward=[meta.R[6],meta.R[7],meta.R[8]];
      const radius=2;
      center=position.map((v,j)=>v+forward[j]*radius);
    }
    this.orbitState={meta,center,position,up};
    this.session.view.renderNow();
  }
  orbit(dx=0,dy=0,zoom=0){
    if(!this.ready||!this.orbitState||this.phase==='error')return;
    const state=this.orbitState,{center,up}=state;
    const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const norm=v=>{const d=Math.hypot(...v)||1;return v.map(x=>x/d)};
    const rotate=(v,axis,theta)=>{
      const c=Math.cos(theta),sn=Math.sin(theta),cr=cross(axis,v),dp=dot(axis,v);
      return v.map((x,i)=>x*c+cr[i]*sn+axis[i]*dp*(1-c));
    };
    let offset=state.position.map((x,i)=>x-center[i]);
    if(dx)offset=rotate(offset,norm(up),-dx*.005);
    if(dy){
      const forward=norm(offset.map(v=>-v));
      const right=norm(cross(forward,up));
      const candidate=rotate(offset,right,-dy*.005);
      if(Math.abs(dot(norm(candidate),norm(up)))<.985)offset=candidate;
    }
    if(zoom){const factor=Math.exp(Math.max(-.7,Math.min(.7,zoom*.001)));offset=offset.map(v=>v*factor)}
    state.position=center.map((c,i)=>c+offset[i]);
    const forward=norm(center.map((c,i)=>c-state.position[i]));
    const right=norm(cross(forward,up));
    const down=norm(cross(forward,right));
    const R=[...right,...down,...forward];
    const t=[-dot(right,state.position),-dot(down,state.position),-dot(forward,state.position)];
    this.session.view.setCamera({...state.meta,R,t});
  }
  cancel(){this.cancelRequested=true;this.controller?.abort()}
  async run(files,{maxIters=12000,budgetProfile='balanced',photoMeta=[]}={}){
    if(this.pending||this.ready)throw Error('Сначала завершите или сбросьте предыдущую реконструкцию');
    if(!navigator.gpu)throw Error('Для обучаемого Gaussian Splatting требуется WebGPU. Включите аппаратное ускорение и откройте сайт в совместимом браузере.');
    validateCapture(files);
    await this.reset();
    if(this.cancelRequested)throw Error('Реконструкция отменена');
    const revision=++this.revision;
    this.controller=new AbortController();const preflightSignal=this.controller.signal;
    const checkPreflight=()=>{if(preflightSignal.aborted||this.cancelRequested||revision!==this.revision)throw Error('Реконструкция отменена')};
    this.phase='preflight';this.emit('Проверка WebGPU и расчёт безопасного разрешения фотосета…');
    try{
      const gpu=await acquireScanDevice(navigator.gpu,{
        signal:preflightSignal,onStage:message=>{if(revision===this.revision)this.emit(message)}
      });
      this.device=gpu.device;checkPreflight();
      const validMeta=photoMeta.length===files.length&&photoMeta.every(p=>Number.isFinite(p.width)&&p.width>=64&&Number.isFinite(p.height)&&p.height>=64);
      const meta=validMeta?photoMeta:await Promise.all(files.map(async file=>{
        checkPreflight();let img;
        try{img=await createImageBitmap(file);return {width:img.width,height:img.height}}
        catch(error){throw Error('Не удалось повторно прочитать размеры '+file.name+': '+error.message)}
        finally{img?.close?.()}
      }));
      checkPreflight();
      this.budget=planScanBudget(meta,{profile:budgetProfile,bindingLimit:gpu.bindingLimit});
      this.emit('GPU '+gpu.powerPreference+' · один общий WebGPU device для SfM и тренера. Лимит ресурсов: '+this.budget.trainMaxDim+' px · GPU targets ~'+this.budget.packedMB+' МБ · CPU frames ~'+this.budget.cpuEstimateMB+' МБ'+(this.budget.warning?' · '+this.budget.warning:''),{budget:this.budget});
      checkPreflight();
    }catch(error){
      const normalized=scanError(error,{phase:'preflight',signal:preflightSignal});
      if(revision===this.revision){
        this.phase='error';this.emit(normalized.message,{errorStage:'preflight'});
        this.hooks.onError(normalized,this.report);
        await this.reset(false);
      }
      throw normalized;
    }
    this.pending=true;this.phase='decode';this.report=null;
    const check=()=>{if(this.controller?.signal.aborted||this.cancelRequested||revision!==this.revision)throw Error('Реконструкция отменена')};
    const session=createSession({
      maxIters:Math.max(1000,Math.min(100000,Math.floor(maxIters))),
      itersPerFrame:this.budget.itersPerFrame,
      initTarget:this.budget.initTarget,
      lowMem:true,
      frames:{trainMaxDim:this.budget.trainMaxDim,featMaxDim:this.budget.featMaxDim},
      perf:false,
      device:this.device,
    });
    this.session=session;
    this.unsub.push(session.on('stage',event=>{
      if(revision!==this.revision)return;
      const progress=Number.isFinite(event.done)&&Number.isFinite(event.total)&&event.total>0?Math.round(event.done/event.total*100):null;
      this.emit((event.detail||event.stage||'Обработка')+(progress===null?'':' · '+progress+'%'),{stage:event.stage,done:event.done,total:event.total});
    }));
    this.unsub.push(session.on('log',message=>{if(revision===this.revision)this.emit(String(message).slice(0,400))}));
    this.unsub.push(session.on('metrics',m=>{
      if(revision!==this.revision)return;
      this.emit('Обучение: '+m.iter.toLocaleString('ru-RU')+' / '+session.opts.maxIters.toLocaleString('ru-RU')+' · '+(m.splats||0).toLocaleString('ru-RU')+' Gaussians'+(Number.isFinite(m.psnrTrain)?' · PSNR '+m.psnrTrain.toFixed(1)+' dB':''),{metrics:m});
    }));
    this.unsub.push(session.on('event',e=>{
      if(revision!==this.revision)return;
      if(e.kind==='train-complete'){
        this.phase='complete';this.emit('Обучение завершено: '+e.iter.toLocaleString('ru-RU')+' итераций, '+e.splats.toLocaleString('ru-RU')+' Gaussian Splats.');
        this.hooks.onComplete(e);
      }else if(e.kind==='device-lost'){
        this.phase='error';this.hooks.onError(Error('WebGPU устройство отключилось. Экспорт обучаемой сцены может быть недоступен.'),this.report);
      }
    }));
    try{
      this.emit('Декодирование '+files.length+' фотографий…');
      await session.load(files);check();
      if(session.frames.length<Math.max(4,Math.ceil(files.length*.5)))throw Error('Декодировано только '+session.frames.length+'/'+files.length+' кадров. Проверьте формат, повреждённые снимки и доступную память.');
      this.phase='solve';this.emit('Автоматическое сопоставление признаков и расчёт положений камер…');
      const recon=await session.solve({signal:this.controller.signal});check();
      this.report=sfmDiagnostics(recon,session.frames);
      const minCameras=Math.max(4,Math.ceil(files.length*.5));
      if(recon.cams.length<minCameras||recon.points.length<50)throw Error('Недостаточная регистрация: '+recon.cams.length+'/'+files.length+' камер и '+recon.points.length+' общих точек. Для обучения требуется минимум '+minCameras+' камер и 50 точек. Добавьте ракурсы с перекрытием и параллаксом.');
      this.emit('SfM завершён: '+recon.cams.length+'/'+files.length+' камер, '+recon.points.length+' точек.',{registered:recon.cams.length,points:recon.points.length});
      this.phase='seed';this.emit('Создание начальных Gaussian-примитивов и настройка GPU…');
      await session.seed();check();
      const initial=session.trainer.camMeta[0];
      this.canvas.width=initial.w;this.canvas.height=initial.h;
      session.view.attach(this.canvas);
      this.selectCamera(0);
      check();this.phase='training';
      this.emit('Камеры рассчитаны. Начинаем WebGPU-обучение Gaussian Splats…');
      session.start();check();this.pending=false;
      this.hooks.onReady({registered:recon.cams.length,input:files.length,points:recon.points.length,report:this.report,cameras:session.trainer.camMeta.map((c,i)=>({index:i,imageIndex:c.imgIdx,name:session.frames[c.imgIdx]?.name||'Camera '+(i+1)}))});
      return recon;
    }catch(error){
      const normalized=scanError(error,{phase:this.phase,signal:this.controller?.signal});
      if(revision===this.revision){
        const failedPhase=this.phase;
        this.phase='error';this.emit(normalized.message,{errorStage:failedPhase});
        this.hooks.onError(normalized,this.report);
        this.pending=false;
        await this.reset(false);
      }
      throw normalized;
    }finally{if(revision===this.revision)this.pending=false}
  }
  pause(){
    if(!this.ready)return;
    this.session.pause();this.phase='paused';this.emit('Обучение на паузе. Промежуточный результат можно экспортировать.');
    this.session.view.renderNow();
  }
  resume(){
    if(!this.ready)throw Error('Нет подготовленной сцены');
    if(this.session.deviceLost)throw Error('WebGPU устройство было отключено');
    this.phase='training';this.session.start();this.emit('Обучение продолжено…');
  }
  async finish(){
    if(!this.ready)return;
    await this.session.finish();this.phase='complete';
    this.emit('Обучение завершено вручную. Готово к экспорту.');
  }
  async exportPly(){
    if(!this.ready)throw Error('Нечего экспортировать: сначала выполните расчёт камер и инициализацию обучения');
    return this.session.exportPlyBlob();
  }
  async exportPackage(name,zipConstructor){
    if(!this.ready)throw Error('Сначала выполните SfM и инициализацию 3DGS');
    if(this.phase==='training')this.pause(); // freeze the exact GPU result exported to the bundle
    const splat=await this.exportPly();
    const cloud=this.exportSparse(),cameras=this.exportCameras();
    return scanBundle({name,splat,cloud,cameras,diagnostics:this.report,zipConstructor});
  }
  exportSparse(){
    if(!this.session?.recon)throw Error('Сначала дождитесь расчёта камер');
    return sparsePly(this.session.recon);
  }
  exportCameras(){
    if(!this.session?.recon)throw Error('Сначала дождитесь расчёта камер');
    return cameraReport(this.session.recon,this.session.frames);
  }
  async reset(invalidate=true){
    if(invalidate)this.revision++;
    this.controller?.abort();this.controller=null;
    this.session?.pause();for(const off of this.unsub)off();this.unsub=[];
    try{this.session?.dispose()}catch(e){console.warn('Splat.js disposal:',e)}
    this.session=null;
    try{this.device?.destroy?.()}catch(e){console.warn('Revolum WebGPU cleanup:',e)}
    this.device=null;this.orbitState=null;this.report=null;this.budget=null;this.pending=false;this.phase='idle';
  }
}
