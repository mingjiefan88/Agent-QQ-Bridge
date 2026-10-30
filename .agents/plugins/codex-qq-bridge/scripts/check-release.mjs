import {readFile,readdir,lstat,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,relative,resolve,dirname,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
const root=resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)),'..'));
const manifest=JSON.parse(await readFile(join(root,'release-files.json'),'utf8')),found=[],errors=[];
const validPath=path=>typeof path==='string' && path.length>0 && !path.startsWith('/') && !path.includes('\\') && !path.split('/').some(x=>!x || x==='.' || x==='..' || x.includes(':'));
if(!Array.isArray(manifest) || manifest.some(path=>!validPath(path)))throw Error('Invalid release manifest');
const assets=JSON.parse(await readFile(join(root,'third_party','assets.lock.json'),'utf8'));
async function walk(dir){for(const name of await readdir(dir)){if(dir===root && ['.git','.planning','dist','bundled','node_modules'].includes(name))continue;if(dir===join(root,'.impeccable') && name==='review')continue;const path=join(dir,name),info=await lstat(path),rel=relative(root,path).replaceAll('\\','/');if(info.isSymbolicLink())errors.push('Symlink not permitted: '+rel);else if(info.isDirectory())await walk(path);else if(info.isFile())found.push(rel);else errors.push('Special file not permitted: '+rel);}}
await walk(root);
if(new Set(manifest).size!==manifest.length)errors.push('Duplicate release entry');
for(const path of found)if(!manifest.includes(path))errors.push('Not allowlisted: '+path);
for(const path of manifest)if(!found.includes(path))errors.push('Missing release file: '+path);
for(const path of Object.keys(assets))if(!validPath(path) || !manifest.includes(path) || !/^(public|icons|docs\/images)\/.*\.(png|ico|svg)$/.test(path) || !/^[a-f0-9]{64}$/.test(assets[path]))errors.push('Invalid asset declaration: '+path);
for(const path of found){
 const bytes=await readFile(join(root,path)),extension=extname(path).toLowerCase(),image=['.png','.ico','.svg'].includes(extension);
 if(image){
  if(!Object.hasOwn(assets,path) || createHash('sha256').update(bytes).digest('hex')!==assets[path])errors.push('Image asset digest mismatch: '+path);
  if(extension==='.png' && !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))errors.push('Invalid PNG signature: '+path);
  if(extension==='.ico' && (!bytes.subarray(0,4).equals(Buffer.from([0,0,1,0])) || bytes.length<22 || bytes.readUInt16LE(4)<1))errors.push('Invalid ICO signature: '+path);
 }
 if(!image || extension==='.svg'){
  let content;try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{errors.push('Invalid UTF-8 text: '+path);continue;}
  if(bytes.includes(0))errors.push('Unexpected binary: '+path);
  if(extension==='.svg' && (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(content) || /<(?:script|foreignObject|iframe|image)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|data:|javascript:)/i.test(content)))errors.push('Unsafe or invalid SVG: '+path);
  if([/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/gh[pousr]_[A-Za-z0-9]{36,}/,/github_pat_[A-Za-z0-9_]{40,}/,/sk-[A-Za-z0-9_-]{32,}/].some(x=>x.test(content)))errors.push('Credential pattern: '+path);
 }
 if(/(?:^|\/)(?:config\.json|auth\.json|accounts?\.json|\.env(?:\..*)?|.*\.log|.*\.partial)$/.test(path) || /(?:^|\/)(?:runtime|data|downloads|vendor|cache|node_modules)(?:\/|$)/.test(path))errors.push('Private/runtime file prohibited: '+path);
}
const plugin=JSON.parse(await readFile(join(root,'.codex-plugin','plugin.json'),'utf8')),pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
if(plugin.version!==pkg.version || plugin.name!==pkg.name || !plugin.requires_local_executor || !/^\d+\.\d+\.\d+$/.test(pkg.version))errors.push('Plugin/package stable metadata mismatch');
const mcp=await readFile(join(root,'bin','mcp.mjs'),'utf8');if(!mcp.includes("version:'"+pkg.version+"'"))errors.push('MCP version mismatch');
for(const path of [plugin.skills+'qq-bridge/SKILL.md',plugin.mcpServers]){if(!path.startsWith('./') || !validPath(path.slice(2)))errors.push('Plugin path outside root');else await access(join(root,path)).catch(()=>errors.push('Plugin component missing: '+path));}
const qrHash=createHash('sha256').update(await readFile(join(root,'public','qrcode.js'))).digest('hex');
const lock=JSON.parse(await readFile(join(root,'third_party','qrcode.lock.json'),'utf8'));if(qrHash!==lock.sha256)errors.push('QR asset digest mismatch');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`PASS: ${found.length} allowlisted source files; ${Object.keys(assets).length} declared image assets; stable versions, UTF-8, paths and QR digest verified; no common credential or private runtime files.`);
