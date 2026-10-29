import {mkdir,readFile,writeFile,rename,access,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
let installing=false;
export async function installMedia(root,emit=()=>{}) {
  if(process.platform!=='win32')throw Error('集成点歌组件安装当前支持Windows');
  if(installing)throw Error('正在下载点歌组件，请稍等');installing=true;
  const target=join(root,'vendor','yt-dlp'),path=join(target,'yt-dlp.exe');
  try {
    const lock=JSON.parse(await readFile(new URL('../third_party/media.lock.json',import.meta.url),'utf8'));
    if(await access(path).then(()=>true,()=>false)){if(createHash('sha256').update(await readFile(path)).digest('hex')===lock.sha256)return {installed:true};throw Error('现有点歌组件版本不同，请先人工检查，未覆盖原文件');}
    emit('media','info','正在从yt-dlp官方发布页下载点歌组件');
    const res=await fetch(lock.url,{signal:AbortSignal.timeout(180000)});if(!res.ok || !res.body)throw Error('下载点歌组件失败，请检查网络');
    const reader=res.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>40*1024*1024)throw Error('点歌组件大小异常');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const bytes=Buffer.concat(chunks);if(createHash('sha256').update(bytes).digest('hex')!==lock.sha256)throw Error('点歌组件校验失败，停止安装');await mkdir(target,{recursive:true});await writeFile(path+'.partial',bytes);await rename(path+'.partial',path);await writeFile(join(target,'SOURCE.json'),JSON.stringify(lock,null,2));emit('media','complete','点歌组件安装完成');return {installed:true,version:lock.version};
  } finally {installing=false;await unlink(path+'.partial').catch(()=>{});}
}
