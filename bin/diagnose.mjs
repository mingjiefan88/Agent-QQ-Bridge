import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createQqHealthProbe} from '../src/qq-health.js';

export function parseArgs(args) {
  const result={oneBotBase:'http://127.0.0.1:3000',webUiBase:'http://127.0.0.1:6099',config:''};
  const names={'--onebot':'oneBotBase','--webui':'webUiBase','--webui-config':'config'};
  for(let i=0;i<args.length;i++) {
    const key=names[args[i]],value=args[++i];
    if(!key || !value || value.startsWith('--'))throw Error('参数错误：使用 --onebot、--webui 或 --webui-config，并提供值。');
    result[key]=value;
  }
  for(const key of ['oneBotBase','webUiBase']) {
    const url=new URL(result[key]);
    if(url.protocol!=='http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname!=='/')throw Error('诊断地址必须是本机 HTTP 根地址。');
  }
  return result;
}

export async function main(args) {
  try {
    const options=parseArgs(args);
    let token='';
    if(options.config) {
      try {token=JSON.parse(await readFile(options.config,'utf8')).token;}catch{throw Error('无法读取指定的本机 WebUI 配置。');}
      if(typeof token!=='string' || !token)throw Error('指定的 WebUI 配置没有有效 token。');
    }
    const probe=createQqHealthProbe({...options,readWebUiToken:async()=>token});
    const state=await probe();
    // Publish connection facts only; account identity and credentials are omitted.
    const {ok,lastCheckedAt,lastError,loginPhase,needsScan,oneBotReachable}=state;
    console.log(JSON.stringify({ok,lastCheckedAt,lastError,loginPhase,needsScan,oneBotReachable},null,2));
    return ok?0:1;
  } catch(error) {
    console.error(error instanceof TypeError?'参数错误：地址无效。':error.message);
    return 2;
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=await main(process.argv.slice(2));
