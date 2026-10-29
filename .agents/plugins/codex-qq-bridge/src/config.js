import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomBytes} from 'node:crypto';

export const dataHome=()=>process.env.CODEX_QQ_HOME || join(process.env.LOCALAPPDATA || join(homedir(),'.local','share'),'CodexQQBridge');
export const defaults=()=>({version:1,completed:false,port:3790,ownerUserIds:[],allowedGroups:[],bannedUserIds:[],
  name:'小白',aliases:['小白'],persona:'你是一位聪明、从容、友善的AI助手。自然参与群聊，诚实说明能力与执行结果。',
  codexPath:process.env.CODEX_CLI_PATH || 'codex',model:'',reasoning:'low',qqPath:'',qqAccount:'',oneBotPort:3001,webUiPort:6100,
  oneBotToken:randomBytes(24).toString('hex'),webUiToken:randomBytes(24).toString('hex'),callbackSecret:randomBytes(24).toString('hex'),
  features:{context:true,followup:true,memory:true,vision:true,proactive:false,pokeBack:true,randomPoke:false,stickers:false,stealStickers:false,music:false,images:false,management:false}});
const ids=value=>{if(!Array.isArray(value) || value.length>50 || value.some(x=>!/^\d{5,16}$/.test(String(x))))throw Error('QQ号和群号应为5至16位数字，最多50项');return [...new Set(value.map(String))];};
export function validateConfig(input) {
  const d=defaults(),c={...d,...input,features:{...d.features,...input.features}};
  for(const field of ['port','oneBotPort','webUiPort'])if(!Number.isInteger(c[field]) || c[field]<1024 || c[field]>65535)throw Error('端口必须是1024至65535之间的整数');
  if(new Set([c.port,c.oneBotPort,c.webUiPort]).size!==3)throw Error('三个服务端口不能重复');
  for(const field of ['ownerUserIds','allowedGroups','bannedUserIds'])c[field]=ids(c[field]);
  for(const [key,value] of Object.entries(c.features))if(!(key in d.features) || typeof value!=='boolean')throw Error('功能设置无效');
  if(typeof c.name!=='string' || !c.name.trim() || c.name.length>30)throw Error('名称应为1至30个字符');
  if(!Array.isArray(c.aliases) || c.aliases.length>8 || c.aliases.some(x=>typeof x!=='string' || !x.trim() || x.length>30))throw Error('唤醒词最多8个，每个1至30字符');
  if(typeof c.persona!=='string' || c.persona.length>12000)throw Error('人格设定最多12000个字符');
  for(const key of ['model','codexPath','qqPath','qqAccount'])if(typeof c[key]!=='string' || c[key].length>1000 || /[\x00-\x1f]/.test(c[key]))throw Error('路径或模型参数无效');
  if(!['low','medium','high'].includes(c.reasoning))throw Error('推理强度无效');
  if(c.qqAccount && !/^\d{5,16}$/.test(c.qqAccount))throw Error('机器人QQ号无效');
  for(const key of ['oneBotToken','webUiToken','callbackSecret'])if(typeof c[key]!=='string' || !/^[a-zA-Z0-9_-]{24,128}$/.test(c[key]))throw Error('本地服务密钥无效');
  c.completed=Boolean(c.completed);c.version=1;return c;
}
export function publicConfig(c){const {oneBotToken,webUiToken,callbackSecret,...safe}=c;return safe;}
export async function loadConfig(root) {
  await mkdir(root,{recursive:true});
  try{return validateConfig(JSON.parse(await readFile(join(root,'config.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw Error('配置读取失败，原文件已保留：'+e.message);const c=defaults();await saveConfig(root,c);return c;}
}
export async function saveConfig(root,config) {
  const c=validateConfig(config),path=join(root,'config.json');
  await mkdir(root,{recursive:true});
  await writeFile(path+'.tmp',JSON.stringify(c,null,2),{mode:0o600});await rename(path+'.tmp',path);return c;
}
