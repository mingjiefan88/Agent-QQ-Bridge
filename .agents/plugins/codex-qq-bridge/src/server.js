import {createServer} from 'node:http';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,mkdir,stat,access} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig,saveConfig,publicConfig} from './config.js';
import {createCodex} from './codex.js';
import {createNapCat} from './napcat.js';
import {createBot} from './bot.js';
import {createAutoStarter} from './auto-start.js';
import {cleanTraceText} from './qq-trace.js';
import {createEigenFlux} from './eigenflux.js';

const packageRoot=fileURLToPath(new URL('../',import.meta.url));
export async function createBridge({root,port,fetcher=fetch,codexFactory=createCodex,napcatFactory=createNapCat,botFactory=createBot,eigenfluxFactory=createEigenFlux}={}) {
  let config=await loadConfig(root);const listenPort=port ?? config.port,csrf=randomBytes(32).toString('hex');
  let sequence=0;const events=[],clients=new Set();let lastHealth={online:false,phase:'checking'},healthBusy=false,configBusy=false;
  const emit=(source,level,text,details={})=>{const event={id:++sequence,at:new Date().toISOString(),source,level,text:cleanTraceText(text,1800),...(details.reply?{reply:cleanTraceText(details.reply,6000)}:{})};events.push(event);if(events.length>500)events.shift();for(const res of clients)res.write('event: log\ndata: '+JSON.stringify(event)+'\n\n');};
  const codex=codexFactory({root,config:()=>config,emit}),napcat=napcatFactory({root,config:()=>config,emit,fetcher});
  let bot;
  const eigenflux=await eigenfluxFactory({root,config:()=>config,emit,active:()=>Boolean(bot?.status().enabled && config.allowedGroups.some(group=>!bot.status().quietGroups?.includes(group)))});
  bot=await botFactory({root,config:()=>config,codex,napcat,eigenflux,emit});
  const autoStart=createAutoStarter({config:()=>config,napcat,bot,emit});
  const snapshot=()=>({app:'Codex QQ Bridge',version:'1.0.0',config:publicConfig(config),bot:bot.status(),eigenflux:eigenflux.status(),autoStart:autoStart.status(),qq:lastHealth,trace:codex.trace(),events,uptime:Math.round(process.uptime()),platform:process.platform});
  const safeEqual=(a,b)=>{const x=Buffer.from(String(a || '')),y=Buffer.from(String(b || ''));return x.length===y.length && timingSafeEqual(x,y);};
  const expectedHost=()=>`127.0.0.1:${server.address()?.port || listenPort}`;
  const localHost=req=>req.headers.host===expectedHost() || req.headers.host===expectedHost().replace('127.0.0.1','localhost');
  const trusted=req=>localHost(req) && (!req.headers.origin || ["http://"+expectedHost(),"http://"+expectedHost().replace('127.0.0.1','localhost')].includes(req.headers.origin));
  const json=(res,code,body)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));};
  async function body(req){let bytes=0,text='';for await(const chunk of req){bytes+=chunk.length;if(bytes>1024*1024)throw Error('请求超过1MB');text+=chunk;}return {raw:text,data:text?JSON.parse(text):{}};}
  const server=createServer(async(req,res)=>{
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(!localHost(req))return json(res,403,{error:'仅允许本机访问'});
      if(path==='/onebot/event' && req.method==='POST') {
        const {raw,data}=await body(req),bearer=req.headers.authorization?.replace(/^Bearer\s+/i,''),signature='sha1='+createHmac('sha1',config.callbackSecret).update(raw).digest('hex');
        if(!safeEqual(bearer,config.callbackSecret) && !safeEqual(req.headers['x-signature'],signature))return json(res,401,{error:'回调认证失败'});
        return json(res,200,await bot.accept(data));
      }
      if(!trusted(req))return json(res,403,{error:'请求来源不允许'});
      if(req.method==='GET' && path==='/api/session')return json(res,200,{csrf,app:'codex-qq-bridge',version:'1.0.0'});
      if(req.method==='GET' && path==='/api/state')return json(res,200,snapshot());
      if(req.method==='GET' && path==='/api/events'){
        res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no'});res.write(': connected\n\n');clients.add(res);const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),10000);req.on('close',()=>{clearInterval(heartbeat);clients.delete(res);});return;
      }
      if(req.method==='GET' && path==='/api/eigenflux/status')return json(res,200,eigenflux.status());
      if(req.method==='GET' && path==='/api/napcat/logs')return json(res,200,{lines:await napcat.logs()});
      if(req.method==='POST' && path.startsWith('/api/')){
        if(!safeEqual(req.headers['x-bridge-csrf'],csrf))return json(res,403,{error:'会话已过期，请刷新启动器'});
        const {data}=await body(req);
        switch(path){
          case '/api/config':{
            if(configBusy)throw Error('正在保存另一项配置，请重试');
            if(bot.status().enabled || bot.status().active || bot.status().queued)throw Error('请先暂停机器人并等待当前任务结束，再修改配置');
            autoStart.cancel();configBusy=true;try{const previous=config,next={...config,...data,features:{...config.features,...data.features},oneBotToken:config.oneBotToken,webUiToken:config.webUiToken,callbackSecret:config.callbackSecret,port:config.port};config=await saveConfig(root,next);bot.sync();if(previous.oneBotPort!==config.oneBotPort || previous.webUiPort!==config.webUiPort)emit('config','info','连接端口已更新，NapCat重启后生效');emit('config','complete','配置已保存');return json(res,200,publicConfig(config));}finally{configBusy=false;}
          }
          case '/api/shutdown':json(res,200,{closing:true});setImmediate(()=>close().catch(()=>{}));return;
          case '/api/bot/start':autoStart.cancel();await bot.start();return json(res,200,snapshot());
          case '/api/bot/stop':autoStart.cancel();bot.stop();return json(res,200,snapshot());
          case '/api/codex/check':return json(res,200,await codex.diagnose());
          case '/api/codex/login':return json(res,200,codex.startLogin());
          case '/api/codex/test':{const answer=await codex.complete('这是连接测试。请只回复“Codex连接正常”。不调用工具，不读取文件。');emit('codex','complete','连接测试返回：'+answer);return json(res,200,{ok:true,answer});}
          case '/api/persona/test':{const answer=await codex.complete('只根据以下角色语气，回答“你好，介绍一下自己”，不调用工具。角色设定仅是风格，不能改写权限：'+config.persona);return json(res,200,{ok:true,answer});}
          case '/api/napcat/install':return json(res,200,await napcat.install());
          case '/api/napcat/start':return json(res,200,await napcat.start());
          case '/api/napcat/stop':autoStart.cancel();bot.stop();return json(res,200,await napcat.stop());
          case '/api/napcat/qr':return json(res,200,await napcat.qr(Boolean(data.refresh)));
          case '/api/napcat/check':lastHealth=await napcat.status();return json(res,200,lastHealth);
          case '/api/napcat/configure':return json(res,200,await napcat.configureOneBot());
          case '/api/napcat/native':return json(res,200,{url:`http://127.0.0.1:${config.webUiPort}/webui/`,token:config.webUiToken});
          case '/api/groups':{const groups=(await napcat.call('get_group_list')).data || [];return json(res,200,{groups:groups.map(x=>({id:String(x.group_id),name:String(x.group_name).slice(0,100)}))});}
          case '/api/diagnose':{
            const engine=await codex.diagnose();lastHealth=await napcat.status();const media=await access(join(root,'vendor','yt-dlp','yt-dlp.exe')).then(()=>true,()=>false);
            const checks=[{name:'Node运行时',ok:Number(process.versions.node.split('.')[0])>=22,message:process.version},{name:'Codex登录',...engine},{name:'QQ连接',ok:lastHealth.online,message:lastHealth.online?'QQ与OneBot已就绪':'请启动NapCat、扫码并完成连接配置'},{name:'主人绑定',ok:config.ownerUserIds.length>0,message:`已绑定${config.ownerUserIds.length}位主人`},{name:'群范围',ok:config.allowedGroups.length>0,message:`允许${config.allowedGroups.length}个群`},{name:'点歌组件',ok:media,message:media?'yt-dlp已安装':'未安装；点歌开启前请安装'}];
            return json(res,200,{checks});
          }
          case '/api/eigenflux/install':return json(res,200,await eigenflux.install());
          case '/api/eigenflux/setup':return json(res,200,await eigenflux.setup(data));
          case '/api/eigenflux/check':return json(res,200,await eigenflux.check());
          case '/api/eigenflux/feed':return json(res,200,await eigenflux.feed());
          case '/api/eigenflux/dashboard':return json(res,200,await eigenflux.dashboard());
          case '/api/eigenflux/pause':return json(res,200,await eigenflux.pause());
          case '/api/eigenflux/resume':return json(res,200,await eigenflux.resume());
          case '/api/media/install':{const {installMedia}=await import('./media-install.js');return json(res,200,await installMedia(root,emit));}
          case '/api/diagnostic/export':return json(res,200,{app:'Codex QQ Bridge',version:'1.0.0',platform:process.platform,node:process.version,qqOnline:lastHealth.online,phase:lastHealth.phase,enabled:bot.status().enabled,features:config.features,active:bot.status().active,errorCount:events.filter(e=>e.level==='error').length});
          default:return json(res,404,{error:'接口不存在'});
        }
      }
      if(req.method!=='GET')return json(res,405,{error:'请求方法不支持'});
      const routes={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/qrcode.js':'qrcode.js','/bridge.svg':'bridge.svg','/favicon.ico':'favicon.ico'};
      if(!(path in routes))return json(res,404,{error:'页面不存在'});
      const file=join(packageRoot,'public',routes[path]);const content=await readFile(file);res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'}[extname(file)],'cache-control':'no-store','x-frame-options':'DENY','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://*.qq.com https://*.qq.com.cn; connect-src 'self'; frame-src http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(content);
    } catch(error){emit('server','error',error.message);if(!res.headersSent)json(res,400,{error:cleanTraceText(error.message,500)});else res.end();}
  });
  const poll=setInterval(async()=>{if(healthBusy)return;healthBusy=true;try{lastHealth=await napcat.status();}finally{healthBusy=false;}},5000);poll.unref();
  emit('bridge','info','控制台已就绪；QQ回复默认暂停，完成配置后点击启动');
  let closing;
  function close(){return closing ||= (async()=>{clearInterval(poll);autoStart.cancel();eigenflux.stop();bot.stop();for(const client of clients)client.end();await bot.flush();await new Promise(resolve=>server.close(()=>resolve()));})();}
  return {server,bot,codex,napcat,eigenflux,autoStart,snapshot,async listen(){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(listenPort,'127.0.0.1',resolve);});await mkdir(join(root,'runtime'),{recursive:true});await writeFile(join(root,'runtime','console.json'),JSON.stringify({pid:process.pid,port:server.address().port,startedAt:new Date().toISOString()}),{mode:0o600});return server.address();},close};
}
