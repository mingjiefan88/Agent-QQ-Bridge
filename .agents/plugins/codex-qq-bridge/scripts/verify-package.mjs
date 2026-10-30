import {readFile,mkdir,mkdtemp,readdir,lstat} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),pkg=resolve(process.argv[2]),scratch=resolve(process.argv[3]);
if(process.platform!=='win32')throw Error('This installation check targets Windows');
const {defaults,saveConfig}=await import(pathToFileURL(join(pkg,'src','config.js')));
await mkdir(scratch,{recursive:true});const data=await mkdtemp(join(scratch,'全新安装 data-'));
const paths=JSON.parse(await readFile(join(pkg,'release-files.json'),'utf8'));
if(!Array.isArray(paths) || new Set(paths).size!==paths.length || paths.some(path=>typeof path!=='string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part=>!part || part==='.' || part==='..' || part.includes(':'))))throw Error('Invalid package release manifest');
const bundled=['bundled/NapCat.Shell.zip','bundled/node-v22.14.0-win-x64.zip'];
const expected=new Set([...paths,...bundled]),seen=new Set();
const sums=(await readFile(join(pkg,'SHA256SUMS.txt'),'utf8')).trim().split('\n');
for(const row of sums){const hash=row.slice(0,64),path=row.slice(66).trimEnd();if(!/^[a-f0-9]{64}$/.test(hash) || !expected.has(path) || seen.has(path))throw Error('Invalid or duplicate package checksum entry: '+path);seen.add(path);if(createHash('sha256').update(await readFile(join(pkg,path))).digest('hex')!==hash)throw Error('Package file mismatch: '+path);}
if(seen.size!==expected.size)throw Error('Incomplete package checksum manifest');
async function walk(dir){for(const name of await readdir(dir)){const file=join(dir,name),stat=await lstat(file),path=relative(pkg,file).replaceAll('\\','/');if(stat.isSymbolicLink())throw Error('Package contains a symlink');if(stat.isDirectory())await walk(file);else if(!stat.isFile() || !expected.has(path) && path!=='SHA256SUMS.txt')throw Error('Unexpected package file: '+path);}}
await walk(pkg);
async function freePort(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
const ports=new Set();while(ports.size<3){const port=await freePort();if(![3790,3001,6100].includes(port))ports.add(port);}
const c=defaults();[c.port,c.oneBotPort,c.webUiPort]=ports;await saveConfig(data,c);
const powershell=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
// Exclude system Node so the cold check also exercises the bundled portable runtime.
const env={...process.env,CODEX_QQ_HOME:data,PATH:[join(process.env.SystemRoot,'System32'),process.env.SystemRoot].join(';')};
const ps=(script,extra=[],options={})=>new Promise((resolve,reject)=>{const child=spawn(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',join(pkg,'scripts',script),...extra],{windowsHide:true,env,stdio:'ignore',...options}),timer=setTimeout(()=>{child.kill();reject(Error('PowerShell verification timed out: '+script));},120000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('PowerShell verification failed: '+script+' (exit '+code+')'));});});
await ps('install-napcat.ps1',['-DataRoot',data,'-PackageRoot',pkg]);
await readFile(join(data,'vendor','NapCat','napcat.mjs'));await readFile(join(data,'vendor','NapCat','LICENSE'));
const base=`http://127.0.0.1:${c.port}`;let launched=false,report;
try{
 launched=true;await ps('launcher.ps1',['-NoWindow']);
 const session=await fetch(base+'/api/session',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());if(session.app!=='codex-qq-bridge')throw Error('Wrong launcher identity');
 const state=await fetch(base+'/api/state',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());if(state.bot.enabled || state.config.ownerUserIds.length || state.config.allowedGroups.length || state.config.qqAccount || state.config.completed)throw Error('New package inherited private state or enabled replies');
 if(await lstat(join(data,'runtime','napcat-process.json')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}))throw Error('Cold install unexpectedly started QQ');
 const first=JSON.parse(await readFile(join(data,'runtime','console.json'),'utf8')).pid;
 await ps('launcher.ps1',['-NoWindow']);const again=JSON.parse(await readFile(join(data,'runtime','console.json'),'utf8')).pid;
 if(first!==again)throw Error('Second launch created another hub');
 const portable=join(data,'node-v22.14.0-win-x64','node.exe'),version=(await run(portable,['--version'],{windowsHide:true})).stdout.trim();if(version!=='v22.14.0')throw Error('Wrong portable Node version');
 report={verifiedFiles:sums.length,napcatExtracted:true,portableNode:version,oneClickStartup:true,secondLaunchReusesHub:true,replyEnabled:false,privateBindings:0,qqNotStarted:true,ports:[...ports],dataRoot:data};
}finally{
 if(launched){await ps('stop-console.ps1');let stopped=false;for(let i=0;i<50;i++){try{await fetch(base+'/api/session',{signal:AbortSignal.timeout(500)});}catch{stopped=true;break;}await new Promise(r=>setTimeout(r,100));}if(!stopped)throw Error('Console remains reachable after stop');await ps('stop-console.ps1');}
}
// A foreign app on an isolated test port must remain running after stop is requested.
const foreign=createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({app:'unrelated-test-app'}));});
await new Promise(r=>foreign.listen(0,'127.0.0.1',r));const foreignPort=foreign.address().port,safeData=await mkdtemp(join(scratch,'安全停止 data-'));
try{
 const config=defaults();config.port=foreignPort;await saveConfig(safeData,config);let refused=false;
 try{await ps('stop-console.ps1',[],{env:{...env,CODEX_QQ_HOME:safeData}});}catch{refused=true;}
 if(!refused || (await fetch(`http://127.0.0.1:${foreignPort}/api/session`,{signal:AbortSignal.timeout(5000)}).then(r=>r.json())).app!=='unrelated-test-app')throw Error('Stop did not preserve unrelated service');
}finally{await new Promise(r=>foreign.close(r));}
console.log(JSON.stringify({...report,consoleStopped:true,repeatStopSafe:true,foreignServicePreserved:true}));
