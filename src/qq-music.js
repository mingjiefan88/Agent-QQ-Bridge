import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir, readdir, readFile, stat, realpath, rm} from 'node:fs/promises';
import {join, relative, isAbsolute, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

const MAX_SECONDS=600, MAX_BYTES=25*1024*1024;
const BV=/^BV[A-Za-z0-9]{10}$/;
const safeText=value=>String(value || '').replace(/<[^>]*>/g,'').replace(/\[CQ:[^\]]*\]/gi,'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,140).trim();
const HELP='点歌：/点歌 歌名 [歌手]，或 /点歌 BV号、B站视频链接。也可以 @本小姐 说“来首普通DISCO”。默认从B站找单曲并发送QQ语音；限10分钟、25MB，处理时不接受下一首。/点歌状态 查看进度。';

export function parseMusicRequest(value) {
  const text=String(value || '').trim();
  if(/^\/?点歌帮助$/.test(text))return {type:'help'};
  if(/^\/?点歌状态$/.test(text))return {type:'status'};
  const m=text.match(/^(?:\/?点歌(?=\s|[：:]|$)|(?:请)?(?:给我|帮我)(?:播放|放|点|来)(?:一首|首)?|(?:请)?(?:来|放)(?:一首|首)|我想听|播放歌曲)\s*[：:]?\s*(.*)$/);
  if(!m)return null;
  const query=m[1].trim().replace(/^[「“《"']|[」”》"']$/g,'').trim();
  return query?{type:'play',query}:{type:'help'};
}

export function canonicalBiliUrl(value) {
  if(BV.test(value))return 'https://www.bilibili.com/video/'+value+'/';
  let url;try{url=new URL(value);}catch{return null;}
  if(url.protocol!=='https:' || url.username || url.password || url.port)return null;
  if(!['www.bilibili.com','bilibili.com','m.bilibili.com'].includes(url.hostname))return null;
  const id=url.pathname.match(/^\/video\/(BV[A-Za-z0-9]{10})\/?$/)?.[1];
  if(!id)return null;
  const p=url.searchParams.get('p');
  if(p!==null && !/^[1-9]\d{0,2}$/.test(p))return null;
  return 'https://www.bilibili.com/video/'+id+'/' +(p?'?p='+p:'');
}

export function runMusicTool(executable,args,{timeout=45000,cwd,maxBytes}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',settled=false;
    function stopTimers(){clearTimeout(timer);clearInterval(watch);}
    function fail(error){if(settled)return;settled=true;stopTimers();child.kill();child.once('close',()=>reject(error));}
    const timer=setTimeout(()=>fail(Error('audio tool timeout')),timeout);
    const watch=cwd && maxBytes?setInterval(async()=>{
      try {
        let size=0;for(const name of await readdir(cwd))size+=(await stat(join(cwd,name))).size;
        if(size>maxBytes)fail(Error('audio download too large'));
      } catch {}
    },500):null;
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>4*1024*1024)fail(Error('audio tool output too large'));});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-3000);});
    child.once('error',()=>{if(settled)return;settled=true;stopTimers();reject(Error('audio tool unavailable'));});
    child.once('close',code=>{
      if(settled)return;settled=true;stopTimers();
      if(code!==0)reject(Error(/412|403|429|login|cookies|sign in|会员|登录|验证码/i.test(stderr)?'Bilibili access limited':'audio extraction failed'));
      else resolve(stdout.trim());
    });
  });
}

export function createBiliAudioSource({projectDir,fetcher=fetch,run=runMusicTool}={}) {
  const root=join(projectDir,'runtime','music-cache');
  const executable=join(projectDir,'vendor','yt-dlp',process.platform==='win32'?'yt-dlp.exe':'yt-dlp');
  const headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',Referer:'https://www.bilibili.com/'};
  let visitorUntil=0;
  async function search(query,progress=()=>{}) {
    for(let attempt=0;attempt<2;attempt++) {
      if(Date.now()>visitorUntil) {
        delete headers.Cookie;
        const home=await fetcher('https://www.bilibili.com/',{headers,signal:AbortSignal.timeout(12000)});
        if(!home.ok)throw Error('Bilibili access limited');
        headers.Cookie=home.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
        await home.body?.cancel();visitorUntil=Date.now()+15*60*1000;
      }
      const url=new URL('https://api.bilibili.com/x/web-interface/search/type');
      url.search=new URLSearchParams({search_type:'video',keyword:query,page:'1'}).toString();
      const response=await fetcher(url,{headers,signal:AbortSignal.timeout(15000)});
      if(response.status===429)throw Error('Bilibili rate limited');
      if(!response.ok) {
        visitorUntil=0;
        if(attempt===0 && (response.status===412 || response.status>=500)) {
          await response.body?.cancel();progress('搜索连接临时失效，重新建立访客会话');continue;
        }
        throw Error('Bilibili access limited');
      }
      const body=await response.json();
      if(body.code===-412 && attempt===0){visitorUntil=0;progress('搜索会话已过期，重新获取一次');continue;}
      if(body.code===-352)throw Error('Bilibili verification required');
      if(body.code!==0 || !Array.isArray(body.data?.result)){visitorUntil=0;throw Error('Bilibili search unavailable');}
      const candidates=body.data.result.filter(item=>BV.test(item.bvid) && item.type==='video').filter(item=>{
        const parts=String(item.duration).split(':').map(Number);
        const seconds=parts.reduce((sum,n)=>sum*60+n,0);
        return Number.isFinite(seconds) && seconds>0 && seconds<=MAX_SECONDS;
      });
      if(!candidates.length)throw Error('No matching short song');
      return canonicalBiliUrl(candidates[0].bvid);
    }
    throw Error('Bilibili search unavailable');
  }

  return {
    async init(){await mkdir(root,{recursive:true});await this.cleanup();},
    async cleanup(){
      for(const name of await readdir(root).catch(()=>[])) {
        if(!/^[a-f0-9-]{36}$/.test(name))continue;
        const path=join(root,name),info=await stat(path).catch(()=>null);
        if(info && Date.now()-info.mtimeMs>3600000)await rm(path,{recursive:true,force:true});
      }
    },
    async prepare(query,progress=()=>{}) {
      if(query.length>160 || /[\x00-\x1f]/.test(query))throw Error('Invalid music input');
      let url=canonicalBiliUrl(query);
      if(!url && /(?:https?:|file:|ftp:|[A-Za-z]:[\\/]|^\/|^--)/i.test(query))throw Error('Invalid music input');
      if(!url){progress('搜索B站音源');url=await search(query,progress);}
      progress('检查歌曲时长和音轨');
      const common=['--ignore-config','--no-warnings','--no-playlist','--playlist-items','1','--socket-timeout','15','--retries','1','--extractor-retries','0'];
      const info=JSON.parse(await run(executable,[...common,'--skip-download','--dump-single-json',url]));
      if(info._type==='playlist' || !Number.isFinite(info.duration) || info.duration<=0 || info.duration>MAX_SECONDS)throw Error('Song exceeds duration limit');
      const duration=info.duration;
      const title=safeText(info.title),uploader=safeText(info.uploader);
      const dir=join(root,randomUUID());await mkdir(dir,{recursive:true});
      try {
        progress('下载歌曲音轨');
        await run(executable,[...common,'--no-progress','--max-filesize','25M','--match-filter','duration <= 600','-f','bestaudio/best','--output',join(dir,'source.%(ext)s'),url],{cwd:dir,timeout:120000,maxBytes:MAX_BYTES});
        const files=(await readdir(dir)).filter(name=>/^source\.(m4a|mp4|webm|aac|mp3|ogg|flv|mkv|wav|opus)$/.test(name));
        if(files.length!==1)throw Error('Audio download incomplete or too large');
        const input=join(dir,files[0]),file=await stat(input);
        if(!file.isFile() || file.size<32 || file.size>MAX_BYTES)throw Error('Audio size invalid');
        progress('转成QQ语音');
        const output=join(dir,'voice.silk');
        const addon=join(projectDir,'vendor','NapCat','native','ffmpeg',`ffmpegAddon.${process.platform}.${process.arch}.node`);
        const result=JSON.parse(await run(process.execPath,[fileURLToPath(import.meta.url),'--convert-local-audio',addon,input,output],{cwd:dir,timeout:90000}));
        if(!Number.isFinite(result.duration) || result.duration<=0 || result.duration>MAX_SECONDS+1)throw Error('Converted audio duration invalid');
        await validateMusicVoice(output,root);
        return {path:output,title,uploader,url,duration,dispose:()=>rm(dir,{recursive:true,force:true})};
      } catch(error){await rm(dir,{recursive:true,force:true});throw error;}
    }
  };
}

export async function validateMusicVoice(path,root) {
  const actual=await realpath(path),base=await realpath(root),rel=relative(base,actual);
  if(!rel || isAbsolute(rel) || rel==='..' || rel.startsWith('..'+sep))throw Error('Audio outside cache');
  const info=await stat(actual);
  if(!info.isFile() || info.size<12 || info.size>MAX_BYTES)throw Error('Invalid voice size');
  const header=(await readFile(actual)).subarray(0,10);
  if(header[0]!==2 || header.subarray(1).toString()!=='#!SILK_V3')throw Error('Invalid voice format');
  return actual;
}

export async function sendMusicVoice({base,event,path,root,fetcher=fetch}) {
  const actual=await validateMusicVoice(path,root);
  const action=event.groupId?'send_group_msg':'send_private_msg';
  const target=String(event.groupId || event.senderId || '');
  if(!/^[1-9]\d{4,15}$/.test(target))throw Error('Invalid QQ target');
  try {
    const response=await fetcher(base.replace(/\/$/,'')+'/'+action,{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify({[event.groupId?'group_id':'user_id']:Number(target),message:[{type:'record',data:{file:pathToFileURL(actual).href}}]})});
    const body=await response.json();
    if(!response.ok || body.retcode!==0 || body.status==='failed' || body.data?.message_id==null)throw Error('unconfirmed');
    return {ok:true,messageId:String(body.data.message_id)};
  } catch {throw Error('QQ voice delivery unconfirmed');}
}

function publicError(error) {
  const message=String(error?.message || error);
  if(/Invalid music input/.test(message))return '请发歌名、完整BV号或标准B站视频链接。';
  if(/rate limited/.test(message))return 'B站限制了请求频率，请稍后再试。';
  if(/verification required/.test(message))return 'B站要求人工验证，本次搜索已停止。';
  if(/access limited|search unavailable/i.test(message))return 'B站暂时限制了访问，或该视频需要登录。本次没有取得音源。';
  if(/No matching/.test(message))return '没找到10分钟以内的音源，换个歌名或直接给本小姐BV号。';
  if(/duration/.test(message))return '这段音频时长无法确认或超过10分钟，请指定单曲或分P。';
  if(/size|too large|incomplete/.test(message))return '音轨下载不完整或超过25MB，本次已停止。';
  if(/timeout|aborted/i.test(message))return '点歌处理超时，本次已停止，没有自动重复发送。';
  if(/delivery/.test(message))return 'QQ语音发送结果未确认，本小姐不会自动重发。';
  return '这次音源下载、转码或发送失败了，点歌状态中可查看失败阶段。';
}

export function createMusicService({qq,channelEnabled,source,sendText,sendVoice,now=Date.now}) {
  let busy=false,last=null,sequence=0;
  const events=[],cooldowns=new Map();
  const scope=event=>event.groupId?'group:'+event.groupId:'private:'+event.senderId;
  function allowed(event){
    return channelEnabled() && event.senderId && event.senderId!==event.selfId && !qq.bannedUserIds.includes(String(event.senderId)) && (event.groupId?qq.allowedGroups.includes(String(event.groupId)):qq.ownerUserIds.includes(String(event.senderId)));
  }
  function progress(job,stage){
    job.stage=stage;job.updatedAt=new Date(now()).toISOString();
    events.push({id:++sequence,at:job.updatedAt,text:stage,status:job.status});if(events.length>30)events.shift();
    console.log('[QQ点歌] '+stage);
  }
  return {
    allowed,
    init:()=>source.init(),
    status:()=>({enabled:true,busy,last:last?{...last}:null,events:[...events]}),
    async handle(event,command){
      if(!allowed(event))return {ignored:true};
      const reply=async text=>{if(!allowed(event))return {ok:false};return sendText(event,text);};
      if(command.type==='help')return {reply:HELP,send:await reply(HELP)};
      if(command.type==='status'){
        const text=last?.scope===scope(event)?`点歌${last.status==='completed'?'已发送':last.status==='failed'?'失败':'处理中'}：${last.stage}${last.error?'。'+last.error:''}`:'本小姐还没有这个会话的点歌任务。';
        return {reply:text,send:await reply(text)};
      }
      const age=now()-Number(event.raw?.time)*1000;
      if(!Number.isFinite(age) || age>120000 || age < -30000)return {ignored:true};
      if(busy){const text='本小姐正在处理上一首，稍等片刻再点。';return {reply:text,send:await reply(text)};}
      if(now()-(cooldowns.get(scope(event)) || 0)<30000){const text='两次点歌至少间隔30秒，稍后再来。';return {reply:text,send:await reply(text)};}
      // ponytail: one audio job at a time bounds CPU, disk and group spam; add a queue only if requested.
      busy=true;cooldowns.set(scope(event),now());
      for(const [key,time] of cooldowns)if(now()-time>60000)cooldowns.delete(key);
      const job={scope:scope(event),status:'working',stage:'开始找音源',updatedAt:new Date(now()).toISOString()};last=job;
      let asset;
      try {
        progress(job,'开始找音源');
        const ack=await reply('这首交给本小姐，找到音源后直接发语音。');
        if(ack?.ok!==true)throw Error('QQ voice delivery unconfirmed');
        asset=await source.prepare(command.query,stage=>progress(job,stage));
        if(!allowed(event))throw Error('QQ channel or permission changed');
        progress(job,'上传QQ语音');
        const send=await sendVoice(event,asset.path);
        if(send?.ok!==true)throw Error('QQ voice delivery unconfirmed');
        job.status='completed';job.title=asset.title;job.source=asset.url;job.messageId=send.messageId;
        progress(job,'语音已发送：'+asset.title);
        return {reply:`[歌曲语音] ${asset.title}`,send};
      } catch(error){
        job.status='failed';job.error=publicError(error);progress(job,'失败于：'+job.stage);
        const text='本小姐这次没完成点歌。'+job.error;
        let send;try{send=await reply(text);}catch{send={ok:false};}
        return {reply:text,error:job.error,send};
      } finally {await asset?.dispose().catch(()=>{});busy=false;await source.cleanup().catch(()=>{});}
    }
  };
}

// Run native decoding in a killable subprocess; never pass remote URLs to the addon.
if(process.argv[2]==='--convert-local-audio' && process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  try {
    const [addon,input,output]=process.argv.slice(3);
    const codec=createRequire(import.meta.url)(addon);
    const duration=await codec.getDuration(input);
    if(!Number.isFinite(duration) || duration<=0 || duration>MAX_SECONDS)throw Error('Invalid audio duration');
    await codec.convertToNTSilkTct(input,output);
    console.log(JSON.stringify({duration:await codec.getDuration(output)}));
  } catch {console.error('Local audio conversion failed');process.exitCode=1;}
}
