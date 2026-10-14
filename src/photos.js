export const PHOTO_EXTENSIONS=['jpg','jpeg','png','webp','heic','heif'];
export const formatSize=bytes=>bytes>=1024**3?(bytes/1024**3).toFixed(2)+' GB':bytes>=1024**2?(bytes/1024**2).toFixed(1)+' MB':Math.ceil(bytes/1024)+' KB';
export function isPhoto(file){return file.type.startsWith('image/')||PHOTO_EXTENSIONS.includes(file.name.toLowerCase().split('.').pop())}
export async function inspectPhoto(file){
  if(file.size>50*1024*1024)throw Error('Фото '+file.name+' больше 50 МБ');
  let bitmap=null,src=null;
  try{
    bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
    const width=bitmap.width,height=bitmap.height,flags=[];
    if(width<1600||height<1200)flags.push('Низкое разрешение');
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0,64,64);
    const data=context.getImageData(0,0,64,64).data;
    let sum=0,dark=0,bright=0;
    for(let i=0;i<data.length;i+=4){
      const l=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
      sum+=l;if(l<14)dark++;if(l>244)bright++;
    }
    const mean=sum/4096;
    if(mean<45||dark/4096>.55)flags.push('Возможно слишком темно');
    if(mean>220||bright/4096>.55)flags.push('Возможно пересвет');
    return {width,height,flags};
  }catch(error){throw Error('Не удалось прочитать '+file.name+'. Формат может не поддерживаться браузером.')}finally{bitmap?.close()}
}
export function photoView(photo){return {id:photo.id,file:photo.file,width:photo.width,height:photo.height,flags:photo.flags||[]}}
