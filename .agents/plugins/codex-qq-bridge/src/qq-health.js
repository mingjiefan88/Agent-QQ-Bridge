import {createHash} from 'node:crypto';

const PHASES={waiting_qrcode:'等待扫码登录',qrcode_scanned:'手机已扫码，等待授权完成',initializing:'登录初始化中',reconnecting:'QQ登录已中断，NapCat正在恢复',offline:'QQ已离线，需要重新登录',captcha:'需要在QQ登录页面完成验证',new_device:'需要在手机QQ完成新设备验证'};

export function createQqHealthProbe({oneBotBase,webUiBase='http://127.0.0.1:6099',readWebUiToken=async()=>'',fetcher=fetch,now=Date.now}) {
  let credential='',credentialUntil=0,cached=null,checked=0,pending=null;
  async function request(base,path,options={}) {
    const response=await fetcher(base.replace(/\/$/,'')+path,{...options,signal:AbortSignal.timeout(2500)});
    if(!response.ok)throw Error('Service unavailable');
    return response.json();
  }
  async function loginStatus() {
    const url=new URL(webUiBase);
    if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.protocol!=='http:')throw Error('WebUI must be local');
    if(!credential || now()>credentialUntil) {
      const token=await readWebUiToken();
      if(!token)throw Error('WebUI token unavailable');
      const hash=createHash('sha256').update(token+'.napcat').digest('hex');
      const response=await request(webUiBase,'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hash})});
      if(response.code!==0 || !response.data?.Credential)throw Error('WebUI authentication unavailable');
      credential=response.data.Credential;credentialUntil=now()+50*60*1000;
    }
    const response=await request(webUiBase,'/api/QQLogin/CheckLoginStatus',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+credential},body:'{}'});
    if(response.code!==0){credential='';throw Error('WebUI login status unavailable');}
    // Keep QR URLs, passwords, tokens and raw provider errors out of public state.
    return {phase:String(response.data?.loginPhase || 'unknown'),online:response.data?.isLogin===true && response.data?.coreReady===true};
  }
  async function check() {
    const base={ok:false,lastCheckedAt:new Date(now()).toISOString(),lastError:null,selfId:null,nickname:null,loginPhase:'unavailable',needsScan:false,oneBotReachable:false};
    const [status,login]=await Promise.allSettled([request(oneBotBase,'/get_status'),request(oneBotBase,'/get_login_info')]);
    const s=status.status==='fulfilled'?status.value:null,l=login.status==='fulfilled'?login.value:null;
    const statusOk=s?.retcode===0 && s.status!=='failed',loginOk=l?.retcode===0 && l.status!=='failed' && l.data?.user_id!=null;
    base.oneBotReachable=Boolean(statusOk);
    if(statusOk && s.data?.online===true && s.data?.good!==false && loginOk)return {...base,ok:true,loginPhase:'ready',selfId:String(l.data.user_id),nickname:String(l.data.nickname || '').replace(/[\x00-\x1f]/g,' ').slice(0,80)};
    try {
      const web=await loginStatus();
      base.loginPhase=web.phase;base.needsScan=web.phase==='waiting_qrcode';
      base.lastError=web.online?'QQ已登录，但OneBot接口尚未就绪':PHASES[web.phase] || 'QQ未就绪，请查看NapCat登录页面';
    } catch {base.lastError=statusOk?'OneBot可访问，但QQ账号不在线':'OneBot未连接，请检查NapCat进程和QQ登录状态';}
    return base;
  }
  return async function probe({force=false}={}) {
    if(pending)return pending;
    if(!force && cached && now()-checked<5000)return cached;
    pending=check().then(value=>{cached=value;checked=now();return value;}).finally(()=>{pending=null;});
    return pending;
  };
}
