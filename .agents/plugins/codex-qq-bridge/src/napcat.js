import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,access,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cleanTraceText} from './qq-trace.js';

const packageRoot=fileURLToPath(new URL('../',import.meta.url));
export function createNapCat({root,config,emit=()=>{},fetcher=fetch}) {
  let credential='',credentialAt=0,installing=false,starting=false;
  const oneBot=()=>`http://127.0.0.1:${config().oneBotPort}`,webBase=()=>`http://127.0.0.1:${config().webUiPort}`;
  const napcatDir=join(root,'vendor','NapCat');
  async function call(action,params={}) {
    if(!/^[a-z][a-z0-9_]{1,60}$/.test(action))throw Error('Invalid OneBot action');
    const res=await fetcher(`${oneBot()}/${action}`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+config().oneBotToken},body:JSON.stringify(params),signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw Error(`QQ接口不可用（HTTP ${res.status}）`);const body=await res.json();if(body.retcode!==0 || body.status==='failed')throw Error(`QQ操作未确认：${action}（${body.retcode}）`);return body;
  }
  async function web(path,body={}) {
    const request=async(p,b,auth='')=>{const res=await fetcher(webBase()+p,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+auth}:{})},body:JSON.stringify(b),signal:AbortSignal.timeout(6000)});if(!res.ok)throw Error('NapCat登录界面未就绪');const r=await res.json();if(r.code!==0)throw Error('NapCat登录接口不可用，请检查密钥或查看原生界面');return r.data;};
    if(!credential || Date.now()-credentialAt>40*60000){const hash=createHash('sha256').update(config().webUiToken+'.napcat').digest('hex');const r=await request('/api/auth/login',{hash});credential=r.Credential;credentialAt=Date.now();if(!credential)throw Error('NapCat认证失败');}
    try{return await request(path,body,credential);}catch(e){credential='';throw e;}
  }
  async function status(){try{const [s,l]=await Promise.all([call('get_status'),call('get_login_info')]);if(s.data?.online===true && s.data.good!==false && l.data?.user_id)return {online:true,userId:String(l.data.user_id),nickname:String(l.data.nickname || '').slice(0,80),phase:'ready'};}catch{}
    try{const s=await web('/api/QQLogin/CheckLoginStatus');return {online:false,qqLoggedIn:Boolean(s.isLogin && s.coreReady),phase:s.isLogin && s.coreReady?'onebot_pending':s.loginPhase || 'waiting_qrcode'};}catch{return {online:false,phase:'unavailable'};}}
  async function qr(refresh=false){if(refresh)await web('/api/QQLogin/RefreshQRcode');const s=await web('/api/QQLogin/CheckLoginStatus');if(s.isLogin && s.coreReady)return {online:true};const r=await web('/api/QQLogin/GetQQLoginQrcode');const value=typeof r==='string'?r:r?.qrcode || r?.qrCode || r?.url;return {online:false,qr:value || null,phase:s.loginPhase || 'waiting_qrcode'};}
  async function install(){if(installing)throw Error('正在安装NapCat，请稍等');installing=true;try{
    await mkdir(join(root,'vendor'),{recursive:true});
    if(await access(join(napcatDir,'napcat.mjs')).then(()=>true,()=>false))return {installed:true,existing:true};
    const script=join(packageRoot,'scripts','install-napcat.ps1');await powershell(script,['-DataRoot',root,'-PackageRoot',packageRoot]);emit('napcat','complete','NapCat安装完成');return {installed:true};
  }finally{installing=false;}}
  async function start(){if(starting)throw Error('NapCat正在启动');starting=true;try{
    const c=config();if(!c.qqPath)throw Error('请先选择本机官方QQ的QQ.exe路径');
    await install();const live=await status();if(live.online)throw Error('所配置端口已有在线QQ，请勿重复启动');
    await mkdir(join(napcatDir,'config'),{recursive:true});
    // Configuration belongs to this private installation; the official payload is never modified.
    await writeFile(join(napcatDir,'config','webui.json'),JSON.stringify({host:'127.0.0.1',port:c.webUiPort,token:c.webUiToken,autoLoginAccount:c.qqAccount,loginRate:3,disableWebUI:false},null,2),{mode:0o600});
    await powershell(join(packageRoot,'scripts','napcat-process.ps1'),['-Action','Start','-DataRoot',root,'-QQPath',c.qqPath]);credential='';emit('napcat','info','NapCat启动请求完成，等待QQ初始化');return {started:true};
  }finally{starting=false;}}
  async function configureOneBot(){const s=await status();const login=await web('/api/QQLogin/GetQQLoginInfo');const id=String(s.userId || login.uin || login.account || config().qqAccount || '');if(!/^\d{5,16}$/.test(id))throw Error('请先登录QQ，或填写机器人QQ号后保存');
    const c=config(),path=join(napcatDir,'config',`onebot11_${id}.json`);
    const body={network:{httpServers:[{name:'CodexQQBridge',enable:true,port:c.oneBotPort,host:'127.0.0.1',enableCors:false,enableWebsocket:false,messagePostFormat:'array',token:c.oneBotToken}],httpClients:[{name:'CodexQQBridge',enable:true,url:`http://127.0.0.1:${c.port}/onebot/event`,messagePostFormat:'array',reportSelfMessage:false,token:c.callbackSecret}],websocketServers:[],websocketClients:[]},musicSignUrl:'',enableLocalFile2Url:true,parseMultMsg:true};
    let existing;try{existing=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('OneBot原配置无法读取，已保留');}
    if(existing)await writeFile(path+'.backup-'+Date.now(),JSON.stringify(existing,null,2),{mode:0o600});
    // NapCat hot-reloads this file. The launcher UI verifies both APIs after save.
    await writeFile(path,JSON.stringify(body,null,2),{mode:0o600});emit('napcat','info','已保存QQ连接配置；请等待接口重载，未就绪时重启NapCat');return {saved:true};
  }
  async function logs(){const dir=join(root,'runtime','logs'),lines=[];for(const name of ['napcat.log','napcat.err.log']){const path=join(dir,name);try{const info=await stat(path);const {open}=await import('node:fs/promises');const file=await open(path);try{const size=Math.min(info.size,48000),bytes=Buffer.alloc(size);await file.read(bytes,0,size,Math.max(0,info.size-size));lines.push(...bytes.toString('utf8').split(/\r?\n/).slice(-100).map(x=>cleanTraceText(x,1200)));}finally{await file.close();}}catch{}}
    // Auth secrets can appear verbatim in NapCat startup URLs.
    return lines.filter(Boolean).map(x=>[config().webUiToken,config().oneBotToken,config().callbackSecret].reduce((s,secret)=>s.replaceAll(secret,'[已遮蔽]'),x).replace(/https?:\/\/[^\s]*[?&](?:token|key|auth)=[^\s]*/gi,'[含密钥的本地链接已遮蔽]')).slice(-150);
  }
  return {call,web,status,qr,install,start,logs,configureOneBot,oneBot,dir:napcatDir,
    stop:async()=>{await powershell(join(packageRoot,'scripts','napcat-process.ps1'),['-Action','Stop','-DataRoot',root]);credential='';emit('napcat','info','本启动器管理的NapCat进程已停止');return {stopped:true};}};
}
function powershell(script,args){if(process.platform!=='win32')throw Error('NapCat集成安装和启停当前支持Windows');return new Promise((resolve,reject)=>{const p=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,...args],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});let error='';p.stdout.resume();p.stderr.on('data',x=>{error=(error+x).slice(-1500);});p.on('error',()=>reject(Error('无法启动Windows安装辅助程序')));p.on('close',code=>code===0?resolve():reject(Error(cleanTraceText(error,500) || 'NapCat辅助程序失败')));});}
