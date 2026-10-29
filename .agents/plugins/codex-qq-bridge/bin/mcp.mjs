#!/usr/bin/env node
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dataHome} from '../src/config.js';
const root=dataHome();
const names={bridge_status:'查看本机QQ机器人当前在线状态与任务数量；不返回QQ号、群聊或密钥。',bridge_launch:'打开或复用Windows集成启动器，首次使用进入配置引导。',bridge_pause:'暂停QQ机器人回复，保留QQ登录和控制台。',bridge_diagnose:'执行本机连接诊断，不发送QQ消息。'};
async function connect(){let port=3790;try{port=JSON.parse(await readFile(join(root,'runtime','console.json'),'utf8')).port;}catch{}if(!Number.isInteger(port) || port<1024 || port>65535)throw Error('启动器端口无效');const base=`http://127.0.0.1:${port}`;const session=await fetch(base+'/api/session',{signal:AbortSignal.timeout(3000)}).then(r=>r.json());if(session.app!=='codex-qq-bridge')throw Error('端口并非Codex QQ启动器');return {base,csrf:session.csrf};}
async function call(name){
  if(name==='bridge_launch'){if(process.platform!=='win32')throw Error('此启动器当前支持Windows');const script=fileURLToPath(new URL('../scripts/launcher.ps1',import.meta.url));await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,shell:false,stdio:'ignore'});child.on('error',()=>reject(Error('启动器无法启动')));child.on('close',code=>code===0?resolve():reject(Error('启动器退出码'+code)));});const {base}=await connect();return {url:base};}
  const {base,csrf}=await connect();
  const get=path=>fetch(base+path,{signal:AbortSignal.timeout(30000)}).then(r=>r.json());
  const post=path=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-bridge-csrf':csrf},body:'{}',signal:AbortSignal.timeout(30000)}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error);return b;});
  if(name==='bridge_pause'){await post('/api/bot/stop');return {paused:true};}
  if(name==='bridge_diagnose')return post('/api/diagnose');
  if(name==='bridge_status')return post('/api/diagnostic/export');
  throw Error('Unknown tool');
}
const tools=Object.entries(names).map(([name,description])=>({name,description,inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:['bridge_status','bridge_diagnose'].includes(name),destructiveHint:false,openWorldHint:name==='bridge_launch'}}));
const reply=(id,result,error)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,...(error?{error}:{result})})+'\n');
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of input){let req;try{if(line.length>1024*1024)throw Error('Request too large');req=JSON.parse(line);if(req.id===undefined)continue;
  if(req.method==='initialize')reply(req.id,{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'codex-qq-bridge',version:'0.1.0-beta.2'}});
  else if(req.method==='ping')reply(req.id,{});
  else if(req.method==='tools/list')reply(req.id,{tools});
  else if(req.method==='tools/call'){if(!Object.hasOwn(names,req.params?.name))throw Error('Tool not found');const result=await call(req.params.name);reply(req.id,{content:[{type:'text',text:JSON.stringify(result)}]});}
  else reply(req.id,null,{code:-32601,message:'Method not found'});
}catch(error){reply(req?.id ?? null,null,{code:-32000,message:error.message});}}
