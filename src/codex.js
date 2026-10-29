import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {createExecutionTrace,cleanTraceText} from './qq-trace.js';

export function createCodex({root,config,emit=()=>{},spawnImpl=spawn}) {
  const trace=createExecutionTrace(),children=new Set();let login=null;
  async function runCli(args,prompt='',options={}) {
    args=args.filter((value,index)=>!(value==='-m' && !args[index+1]) && !(index>0 && args[index-1]==='-m' && !value));
    const ticket=trace.begin(options.label || 'Codex'),started=Date.now();
    return new Promise((resolveRun,reject)=>{
      const child=spawnImpl(config().codexPath,args,{cwd:options.cwd || root,env:options.env || process.env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});children.add(child);
      let out='',err='',done=false;
      const timer=setTimeout(()=>{child.kill();finish(Error('Codex调用超时，已停止本次等待'));},options.timeout || 120000);
      function finish(error) {if(done)return;done=true;clearTimeout(timer);children.delete(child);ticket.finish(error?'failed':'completed',error?'任务失败：'+cleanTraceText(error.message):undefined);emit('codex',error?'error':'complete',error?error.message:`任务完成，耗时${((Date.now()-started)/1000).toFixed(1)}秒`);if(error)reject(error);else resolveRun({stdout:out,stderr:err,threadId:ticket.threadId,code:0});}
      child.stdout.on('data',b=>{const text=String(b);out=(out+text).slice(-2*1024*1024);ticket.feed(text);});
      child.stderr.on('data',b=>{err=(err+String(b)).slice(-32000);});
      child.on('error',()=>finish(Error('无法启动Codex；请在连接设置中检查Codex可执行文件')));
      child.on('close',code=>finish(code===0?null:Error('Codex执行失败：'+cleanTraceText(err || '退出码 '+code,180))));
      child.stdin.on('error',()=>{});child.stdin.end(prompt);
    });
  }
  async function complete(prompt,images=[]) {
    const temp=join(root,'runtime','replies');await mkdir(temp,{recursive:true});const dir=await mkdtemp(join(temp,'turn-'));
    try {
      const output=join(dir,'answer.txt'),c=config();
      const args=['exec','--ephemeral','--ignore-user-config','--ignore-rules','--skip-git-repo-check','-s','read-only','--disable','shell_tool','--disable','unified_exec','--disable','view_image','--disable','image_generation','-C',dir,'--json','-c',`model_reasoning_effort=${JSON.stringify(c.reasoning)}`,'-o',output];
      if(c.model)args.push('-m',c.model);
      for(const image of images)args.push('--image',image);
      args.push('-');await runCli(args,prompt,{cwd:dir});
      const text=(await readFile(output,'utf8')).trim();if(!text)throw Error('Codex未返回回复内容');return text.slice(0,6000);
    } finally {if(!resolve(dir).startsWith(resolve(temp)+sep))throw Error('Invalid reply cache path');await rm(dir,{recursive:true,force:true});}
  }
  async function diagnose(){try{const r=await runCli(['login','status'],'',{timeout:15000,label:'Codex登录检测'});return {ok:true,message:cleanTraceText(r.stdout || r.stderr,300)};}catch(e){return {ok:false,message:e.message};}}
  function startLogin(){if(login)return {started:true};login=spawnImpl(config().codexPath,['login','--device-auth'],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});const safe=b=>emit('codex-login','info',cleanTraceText(b,1200));login.stdout.on('data',safe);login.stderr.on('data',safe);login.on('error',()=>{emit('codex-login','error','无法启动Codex登录，请检查CLI路径');login=null;});login.on('close',code=>{emit('codex-login',code===0?'complete':'error',code===0?'Codex授权结束，请重新检测连接':'Codex登录已结束，请检查授权结果');login=null;});return {started:true};}
  return {runCli,complete,diagnose,startLogin,trace:()=>trace.state,cancel:()=>{for(const child of children)child.kill();login?.kill();}};
}
