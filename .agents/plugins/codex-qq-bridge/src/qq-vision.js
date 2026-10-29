import {mkdir,readdir,lstat,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const MAX_IMAGES=4,MAX_BYTES=10*1024*1024;
const decode=value=>String(value || '').replace(/&#44;/g,',').replace(/&#91;/g,'[').replace(/&#93;/g,']').replace(/&amp;/g,'&');
const opaqueFile=value=>/^[a-zA-Z0-9_.{}-]{1,256}$/.test(value || '');

export function oneBotSegments(message) {
  if(Array.isArray(message))return message;
  const text=String(message || ''),segments=[];let last=0;
  for(const match of text.matchAll(/\[CQ:(\w+)(?:,([^\]]*))?\]/g)) {
    if(match.index>last)segments.push({type:'text',data:{text:decode(text.slice(last,match.index))}});
    const data={};
    for(const part of (match[2] || '').split(',')){const at=part.indexOf('=');if(at>0)data[part.slice(0,at)]=decode(part.slice(at+1));}
    segments.push({type:match[1],data});last=match.index+match[0].length;
  }
  if(last<text.length)segments.push({type:'text',data:{text:decode(text.slice(last))}});
  return segments;
}

function imageInput(data={}) {
  const subType=Number(data.sub_type) || 0;
  return {file:String(data.file || ""),url:String(data.url || ""),subType,isSticker:subType>0 && subType<=7,summary:String(data.summary || "").replace(/[\x00-\x1f]/g," ").slice(0,80)};
}
export function extractOneBotImageInputs(payload={}) {
  const images=[];
  for(const segment of Array.isArray(payload.message)?payload.message:[]) {
    if(segment?.type==='image')images.push(imageInput(segment.data));
  }
  const raw=typeof payload.message==='string'?payload.message:String(payload.raw_message || '');
  for(const match of raw.matchAll(/\[CQ:image,([^\]]+)\]/g)) {
    const parts=Object.fromEntries(match[1].split(',').map(part=>{const at=part.indexOf('=');return [part.slice(0,at),decode(part.slice(at+1))];}));
    images.push(imageInput(parts));
  }
  const seen=new Set();
  return images.filter(image=>{
    const key=image.file || image.url;
    if(!key || key.length>4096 || seen.has(key))return false;
    seen.add(key);return true;
  }).slice(0,12);
}

export const formatQqImageSummary=images=>`${images.length}张QQ图片`;

function cdnUrl(value) {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:' || url.username || url.password || url.port || value.length>4096)return null;
    if(url.hostname!=='multimedia.nt.qq.com.cn' && url.hostname!=='gxh.vip.qq.com' && url.hostname!=='qpic.cn' && !url.hostname.endsWith('.qpic.cn'))return null;
    return url.href;
  } catch{return null;}
}

function imageType(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
  if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return 'jpg';
  if(/^GIF8[79]a$/.test(bytes.subarray(0,6).toString('ascii')))return 'gif';
  if(bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP')return 'webp';
  throw Error('Unsupported image data');
}

export async function cleanupQqVisionCache(root,now=Date.now()) {
  for(const name of await readdir(root).catch(()=>[])) {
    if(!/^[a-f0-9-]{36}$/.test(name))continue;
    const path=join(root,name),info=await lstat(path).catch(()=>null);
    if(info?.isDirectory() && !info.isSymbolicLink() && now-info.mtimeMs>3600000)await rm(path,{recursive:true,force:true});
  }
}

export async function prepareQqModelImages(images,{outputDir,fetchOneBotImage,fetcher=fetch}={}) {
  await mkdir(outputDir,{recursive:true});
  await cleanupQqVisionCache(outputDir);
  const dir=join(outputDir,randomUUID()),paths=[];
  const dispose=()=>rm(dir,{recursive:true,force:true});
  await mkdir(dir);
  try {
    for(const image of images.slice(0,MAX_IMAGES)) {
      let resolved;
      if(opaqueFile(image.file) && fetchOneBotImage)resolved=await fetchOneBotImage(image.file).catch(()=>null);
      // QQ CDN only. Never open a message-supplied local path, data URL or arbitrary host.
      const url=cdnUrl(resolved?.url) || cdnUrl(image.url);
      if(!url)throw Error('No trusted QQ image URL');
      const response=await fetcher(url,{signal:AbortSignal.timeout(15000),redirect:'error'});
      if(!response.ok || !response.body || Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('Image download unavailable');
      const reader=response.body.getReader(),chunks=[];let size=0;
      try {
        while(true) {
          const {done,value}=await reader.read();if(done)break;
          size+=value.length;
          if(size>MAX_BYTES)throw Error('Image exceeds limit');
          chunks.push(Buffer.from(value));
        }
      } finally {await reader.cancel().catch(()=>{});}
      if(size<16)throw Error('Empty image');
      const bytes=Buffer.concat(chunks),type=imageType(bytes);
      const path=join(dir,`${paths.length+1}.${type}`);await writeFile(path,bytes);paths.push(path);
    }
    if(!paths.length)throw Error('No image inputs');
    Object.defineProperty(paths,'dispose',{value:dispose});
    return paths;
  } catch {
    await dispose().catch(()=>{});
    const error=Error('QQ图片消息已收到，但图片读取失败，请重新发送原图或稍后重试。');
    error.code='QQ_IMAGE_INPUT';throw error;
  }
}

// ponytail: latest image metadata per sender/scope; two minutes, at most 200 entries.
export function createRecentQqImageCache({allowed,lookRequest,mentioned,now=Date.now}) {
  const recent=new Map();
  return function attach(event) {
    const at=now();
    for(const [key,item] of recent)if(at-item.at>120000)recent.delete(key);
    if(!allowed(event))return event;
    const key=(event.groupId?'g:'+event.groupId:'private')+':'+event.senderId;
    if(event.images?.length){recent.delete(key);recent.set(key,{at,images:event.images.slice(0,MAX_IMAGES)});}
    else if(!event.hasReplySegment && mentioned(event) && lookRequest(event.text) && recent.has(key)) {
      event.images=recent.get(key).images;event.imageSource='recent_same_sender';
    }
    while(recent.size>200)recent.delete(recent.keys().next().value);
    return event;
  };
}
