import {readFile,mkdir,mkdtemp,writeFile,copyFile,rm,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),files=JSON.parse(await readFile(join(root,'release-files.json'),'utf8'));
const out=resolve(process.env.CODEX_QQ_DIST || join(root,'dist'));await mkdir(out,{recursive:true});
const stage=await mkdtemp(join(out,'package-work-')),pkg=join(stage,'Codex-QQ-Bridge');await mkdir(pkg);
const cacheArg=process.argv.indexOf('--cache');if(cacheArg>=0 && !process.argv[cacheArg+1])throw Error('--cache requires a directory');
const cache=cacheArg>=0?resolve(process.argv[cacheArg+1]):null;
try{
  await run(process.execPath,[join(root,'scripts','check-release.mjs')],{cwd:root});
  const sums=[];
  for(const path of files){const target=join(pkg,path);await mkdir(dirname(target),{recursive:true});const bytes=await readFile(join(root,path));await writeFile(target,bytes);sums.push(createHash('sha256').update(bytes).digest('hex')+'  '+path);}
  await mkdir(join(pkg,'bundled'));
  for(const [name,file] of [['napcat','NapCat.Shell.zip'],['node','node-v22.14.0-win-x64.zip']]){
    const lock=JSON.parse(await readFile(join(root,'third_party',name+'.lock.json'),'utf8'));let bytes;
    if(cache)try{bytes=await readFile(join(cache,file));}catch{}
    if(!bytes){console.log('Downloading official '+name+' '+lock.version);const res=await fetch(lock.url,{signal:AbortSignal.timeout(240000)});if(!res.ok || !res.body)throw Error('Download failed: '+name);const chunks=[];let size=0;const reader=res.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>160*1024*1024)throw Error('Oversized dependency');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}bytes=Buffer.concat(chunks);}
    if(lock.size && bytes.length!==lock.size)throw Error('Dependency size mismatch: '+name);
    const digest=createHash('sha256').update(bytes).digest('hex');if(digest!==lock.sha256)throw Error('Dependency checksum mismatch: '+name);await writeFile(join(pkg,'bundled',file),bytes);sums.push(digest+'  bundled/'+file);
  }
  await writeFile(join(pkg,'SHA256SUMS.txt'),sums.join('\n')+'\n');
  const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version,file=join(out,`Codex-QQ-Bridge-${version}-Windows-x64.zip`);
  if(process.platform==='win32')await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'scripts','archive.ps1'),'-Source',stage,'-Destination',file],{windowsHide:true});else await run('zip',['-q','-r',file,'Codex-QQ-Bridge'],{cwd:stage});
  const hash=createHash('sha256').update(await readFile(file)).digest('hex');await writeFile(file+'.sha256',hash+'  '+file.split(/[\\/]/).at(-1)+'\n');console.log(JSON.stringify({file,sha256:hash,sourceFiles:files.length,included:['NapCat4.18.41 unchanged official archive','Node22.14.0 portable runtime']}));
}finally{const actual=await realpath(stage),base=await realpath(out),rel=relative(base,actual);if(!rel || rel.startsWith('..') || isAbsolute(rel))throw Error('Invalid bundle cleanup path');await rm(actual,{recursive:true,force:true});}
