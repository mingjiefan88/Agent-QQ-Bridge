import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
const id=value=>/^[1-9]\d{4,15}$/.test(String(value));
export function quietCommand(event,aliases=[]){
 const plain=String(event.text || '').replace(/\[CQ:[^\]]*\]/g,'').replace(/[\s，,。.!！~～、]/g,'');
 return Boolean(plain==='把尾巴收一收' || plain==='龙娘别理他' || aliases.some(alias=>plain===alias+'把尾巴收一收' || plain===alias+'别理他') || event.hasSelfAtSegment && plain==='别理他');
}
export async function createQuietGroups(path){
 await mkdir(dirname(path),{recursive:true});let groups=new Set(),writes=Promise.resolve();
 try{const saved=JSON.parse(await readFile(path,'utf8'));if(saved.version!==1 || !Array.isArray(saved.groups) || saved.groups.some(x=>!id(x)))throw Error('Invalid quiet group state');groups=new Set(saved.groups.map(String));}catch(error){if(error.code!=='ENOENT')throw Error('静默设置读取失败，原文件已保留');}
 function save(){const body=JSON.stringify({version:1,groups:[...groups]},null,2);writes=writes.catch(()=>{}).then(async()=>{await writeFile(path+'.tmp',body,{mode:0o600});await rename(path+'.tmp',path);});return writes;}
 return {has:group=>groups.has(String(group)),ids:()=>[...groups],async mute(group){groups.add(String(group));await save();},async resume(group){groups.delete(String(group));await save();},flush:()=>writes};
}
