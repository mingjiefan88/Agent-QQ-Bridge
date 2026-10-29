import {readFile,readdir,lstat,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,relative,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)),'..'));
const manifest=JSON.parse(await readFile(join(root,'release-files.json'),'utf8')),found=[],errors=[];
async function walk(dir){for(const name of await readdir(dir)){if(dir===root && ['.git','.planning','dist','bundled','node_modules'].includes(name))continue;if(dir===join(root,'.impeccable') && name==='review')continue;const path=join(dir,name),info=await lstat(path),rel=relative(root,path).replaceAll('\\','/');if(info.isSymbolicLink())errors.push('Symlink not permitted: '+rel);else if(info.isDirectory())await walk(path);else if(info.isFile())found.push(rel);else errors.push('Special file not permitted: '+rel);}}
await walk(root);
if(new Set(manifest).size!==manifest.length)errors.push('Duplicate release entry');
for(const path of found)if(!manifest.includes(path))errors.push('Not allowlisted: '+path);
for(const path of manifest){if(!found.includes(path))errors.push('Missing release file: '+path);if(path.startsWith('/') || path.includes('..') || path.includes('\\'))errors.push('Invalid release path: '+path);}
for(const path of found){const bytes=await readFile(join(root,path));if(bytes.includes(0))errors.push('Unexpected binary: '+path);const content=bytes.toString('utf8');if([/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/gh[pousr]_[A-Za-z0-9]{36,}/,/github_pat_[A-Za-z0-9_]{40,}/,/sk-[A-Za-z0-9_-]{32,}/].some(x=>x.test(content)))errors.push('Credential pattern: '+path);}
const plugin=JSON.parse(await readFile(join(root,'.codex-plugin','plugin.json'),'utf8')),pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
if(plugin.version!==pkg.version || plugin.name!==pkg.name || !plugin.requires_local_executor)errors.push('Plugin/package metadata mismatch');
for(const path of [plugin.skills+'qq-bridge/SKILL.md',plugin.mcpServers]){if(!path.startsWith('./') || path.includes('..'))errors.push('Plugin path outside root');else await access(join(root,path)).catch(()=>errors.push('Plugin component missing: '+path));}
const qrHash=createHash('sha256').update(await readFile(join(root,'public','qrcode.js'))).digest('hex');
const lock=JSON.parse(await readFile(join(root,'third_party','qrcode.lock.json'),'utf8'));if(qrHash!==lock.sha256)errors.push('QR asset digest mismatch');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`PASS: ${found.length} allowlisted source files; plugin paths/version and QR asset verified; no common credential patterns.`);
