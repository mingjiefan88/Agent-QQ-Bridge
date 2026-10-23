import {readFile,readdir,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,relative,join,dirname} from 'node:path';

const root=resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)),'..'));
const allowed=JSON.parse(await readFile(join(root,'release-files.json'),'utf8'));
const found=[],errors=[];
async function walk(dir){
  for(const name of await readdir(dir)) {
    if(dir===root && ['.git','.planning'].includes(name))continue;
    const path=join(dir,name),info=await lstat(path),rel=relative(root,path).replaceAll('\\','/');
    if(info.isSymbolicLink()){errors.push('不允许符号链接：'+rel);continue;}
    if(info.isDirectory())await walk(path);
    else if(info.isFile())found.push(rel);
    else errors.push('不允许特殊文件：'+rel);
  }
}
await walk(root);
for(const path of found)if(!allowed.includes(path))errors.push('未列入发布清单：'+path);
for(const path of allowed)if(!found.includes(path))errors.push('缺少发布文件：'+path);
if(new Set(allowed).size!==allowed.length)errors.push('发布清单重复');
const secrets=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/gh[pousr]_[A-Za-z0-9]{36,}/,/github_pat_[A-Za-z0-9_]{40,}/,/sk-[A-Za-z0-9_-]{32,}/];
for(const path of found.filter(p=>allowed.includes(p))) {
  const content=await readFile(join(root,path),'utf8');
  if(secrets.some(pattern=>pattern.test(content)))errors.push('疑似凭据：'+path);
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log(`PASS: ${found.length} allowlisted text files; no common credential patterns. Manual review still required.`);
