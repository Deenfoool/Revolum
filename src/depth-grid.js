// Testable, dependency-free depth sampling. Depth Anything V2 predicts relative,
// not metric depth: do not treat output units as metres.
export function percentileRange(values){
  if(!values?.length)throw Error('Пустая карта глубины');
  const valid=Array.from(values).filter(Number.isFinite).sort((a,b)=>a-b);
  if(valid.length<4)throw Error('Недостаточно данных глубины');
  const lo=valid[Math.floor((valid.length-1)*.02)],hi=valid[Math.floor((valid.length-1)*.98)];
  if(!(hi-lo>1e-6))throw Error('На изображении не различима глубина');
  return {lo,hi};
}
export function bilinear(values,w,h,x,y){
  if(values.length!==w*h||w<2||h<2)throw Error('Неверные размеры карты глубины');
  const cx=Math.min(w-1,Math.max(0,x)),cy=Math.min(h-1,Math.max(0,y));
  const x0=Math.floor(cx),x1=Math.min(w-1,x0+1),y0=Math.floor(cy),y1=Math.min(h-1,y0+1);
  const tx=cx-x0,ty=cy-y0;
  const a=values[y0*w+x0],b=values[y0*w+x1],c=values[y1*w+x0],d=values[y1*w+x1];
  return (a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty;
}
export function depthGrid({depth,width,height,imageWidth,imageHeight,columns=160,amplitude=.9}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||depth?.length!==width*height)throw Error('Некорректная карта глубины');
  if(!(imageWidth>0&&imageHeight>0))throw Error('Неизвестны размеры фотографии');
  const {lo,hi}=percentileRange(depth);
  const nx=Math.max(16,Math.min(224,Math.round(columns))),ny=Math.max(12,Math.min(224,Math.round(nx*imageHeight/imageWidth)));
  const positions=new Float32Array((nx+1)*(ny+1)*3),uv=new Float32Array((nx+1)*(ny+1)*2);
  const aspect=imageWidth/imageHeight,span=hi-lo,relative=new Float32Array((nx+1)*(ny+1));
  for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
    const u=x/nx,v=y/ny,i=y*(nx+1)+x;
    const raw=bilinear(depth,width,height,u*(width-1),v*(height-1));
    const n=Math.min(1,Math.max(0,(raw-lo)/span));
    relative[i]=n;
    positions[i*3]=(u-.5)*2*aspect;
    positions[i*3+1]=(.5-v)*2;
    positions[i*3+2]=(n-.5)*amplitude;
    uv[i*2]=u;uv[i*2+1]=1-v;
  }
  // Open up discontinuities instead of creating long ribbons through foreground/background.
  const indices=[];let skipped=0;
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const a=y*(nx+1)+x,b=a+1,c=a+(nx+1),d=c+1;
    const min=Math.min(relative[a],relative[b],relative[c],relative[d]);
    const max=Math.max(relative[a],relative[b],relative[c],relative[d]);
    if(max-min>.32){skipped++;continue}
    indices.push(a,c,b,b,c,d);
  }
  if(indices.length<6)throw Error('Не удалось создать поверхность по этой карте глубины');
  return {positions,uv,indices:new Uint32Array(indices),columns:nx,rows:ny,skipped,range:{lo,hi}};
}
