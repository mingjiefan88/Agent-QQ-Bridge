import {readFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {defaults,saveConfig} from '../src/config.js';
const run=promisify(execFile),pkg=resolve(process.argv[2]),scratch=resolve(process.argv[3]);
if(process.platform!=='win32')throw Error('This installation check targets Windows');
await mkdir(scratch,{recursive:true});const data=await mkdtemp(join(scratch,'clean-install-'));
let port;const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));port=probe.address().port;await new Promise(r=>probe.close(r));
const c=defaults();c.port=port;await saveConfig(data,c);
const sums=(await readFile(join(pkg,'SHA256SUMS.txt'),'utf8')).trim().split('\n');
for(const row of sums){const hash=row.slice(0,64),path=row.slice(66);if(!/^[a-f0-9]{64}$/.test(hash) || path.includes('..') || path.startsWith('/'))throw Error('Invalid package manifest');if(createHash('sha256').update(await readFile(join(pkg,path))).digest('hex')!==hash)throw Error('Package file mismatch: '+path);}
const env={...process.env,CODEX_QQ_HOME:data};
await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(pkg,'scripts','install-napcat.ps1'),'-DataRoot',data,'-PackageRoot',pkg],{windowsHide:true,env,timeout:120000,maxBuffer:1024*1024});
await readFile(join(data,'vendor','NapCat','napcat.mjs'));await readFile(join(data,'vendor','NapCat','LICENSE'));
await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(pkg,'scripts','launcher.ps1'),'-NoWindow'],{windowsHide:true,env,timeout:60000,maxBuffer:1024*1024});
const base=`http://127.0.0.1:${port}`;let session;
try{
 session=await fetch(base+'/api/session').then(r=>r.json());if(session.app!=='codex-qq-bridge')throw Error('Wrong launcher identity');
 const state=await fetch(base+'/api/state').then(r=>r.json());if(state.bot.enabled || state.config.ownerUserIds.length || state.config.allowedGroups.length)throw Error('New package inherited private state or enabled replies');
 const first=JSON.parse(await readFile(join(data,'runtime','console.json'),'utf8')).pid;
 await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(pkg,'scripts','launcher.ps1'),'-NoWindow'],{windowsHide:true,env,timeout:30000});const again=JSON.parse(await readFile(join(data,'runtime','console.json'),'utf8')).pid;
 if(first!==again)throw Error('Second launch created another hub');
 console.log(JSON.stringify({verifiedFiles:sums.length,napcatExtracted:true,oneClickStartup:true,secondLaunchReusesHub:true,replyEnabled:false,privateBindings:0,qqNotStarted:true,dataRoot:data}));
}finally{if(session)await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(pkg,'scripts','stop-console.ps1')],{windowsHide:true,env,timeout:20000});}
