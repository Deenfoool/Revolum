// Browser-only inference. This worker executes a downloaded ONNX model locally;
// neither the source photo nor inference results are sent to a reconstruction API.
// Transformers.js and pretrained weights are fetched from their public static hosts.
const LIBRARY='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const MODEL='onnx-community/depth-anything-v2-small';
let estimatorPromise=null;
const report=(stage,message,percent=null)=>self.postMessage({type:'progress',stage,message,percent});
async function loadEstimator(){
  if(!estimatorPromise){
    estimatorPromise=(async()=>{
      report('library','Загрузка браузерного ML-движка…');
      const {pipeline,env,RawImage}=await import(LIBRARY);
      env.allowLocalModels=false;
      env.backends.onnx.wasm.numThreads=1; // GitHub Pages does not require cross-origin isolation.
      // Default q8 WASM inference works without WebGPU; do not silently pretend GPU is active.
      report('model','Загрузка Depth Anything V2 (квантованная модель; первый запуск требует интернет)…');
      const estimator=await pipeline('depth-estimation',MODEL,{
        device:'wasm',dtype:'q8',progress_callback:info=>{
          const p=Number(info?.progress);
          if(info?.status==='progress'&&Number.isFinite(p))report('model','Загрузка '+(info.file||'весов модели')+' · '+p.toFixed(0)+'%',p);
          else if(info?.status==='ready')report('model','Модель готова');
        }
      });
      return {estimator,RawImage};
    })().catch(e=>{estimatorPromise=null;throw e});
  }
  return estimatorPromise;
}
self.onmessage=async ({data})=>{
  if(data?.type!=='reconstruct'||!data.file)return;
  const id=data.id;
  try{
    const {estimator,RawImage}=await loadEstimator();
    report('inference','Вычисление глубины изображения…');
    const input=await RawImage.fromBlob(data.file);
    const result=await estimator(input);
    const tensor=result?.predicted_depth;
    let width,height,depth;
    if(tensor?.data&&tensor?.dims?.length>=2){
      width=tensor.dims.at(-1);height=tensor.dims.at(-2);
      depth=new Float32Array(tensor.data);
    }else if(result?.depth?.data){
      width=result.depth.width;height=result.depth.height;
      depth=Float32Array.from(result.depth.data);
    }else throw Error('Модель не вернула карту глубины');
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||depth.length!==width*height){
      throw Error('Карта глубины имеет неподдерживаемые размеры');
    }
    report('mesh','Карта глубины получена. Подготовка геометрии…');
    self.postMessage({type:'result',id,width,height,depth},[depth.buffer]);
  }catch(error){
    self.postMessage({type:'error',id,message:error?.message||String(error)});
  }
};
