import {readFile,mkdir,writeFile,copyFile,lstat,readdir} from 'node:fs/promises';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),destination=resolve(process.argv[2] || join(root,'..','repository'));
const rel=relative(root,destination);if(!rel || !rel.startsWith('..') && !isAbsolute(rel))throw Error('Repository export must be outside plugin source');
try{if((await readdir(destination)).length)throw Error('Export destination must be empty; existing files are preserved');}catch(error){if(error.code!=='ENOENT')throw error;}
await promisify(execFile)(process.execPath,[join(root,'scripts','check-release.mjs')],{cwd:root});
const files=JSON.parse(await readFile(join(root,'release-files.json'),'utf8')),nested=join(destination,'.agents','plugins','codex-qq-bridge');
for(const file of files){const source=join(root,file);if(!(await lstat(source)).isFile())throw Error('Expected regular file: '+file);const target=join(nested,file);await mkdir(dirname(target),{recursive:true});await copyFile(source,target);}
for(const file of files.filter(file=>file.startsWith('docs/') || ['README.md','CHANGELOG.md','LICENSE','SECURITY.md','THIRD_PARTY_NOTICES.md','AGENTS.md','.gitignore','.gitattributes'].includes(file))){const target=join(destination,file);await mkdir(dirname(target),{recursive:true});await copyFile(join(root,file),target);}
const marketplace=JSON.parse(await readFile(join(root,'.agents','plugins','marketplace.json'),'utf8'));marketplace.plugins[0].source.path='./.agents/plugins/codex-qq-bridge';
await writeFile(join(destination,'.agents','plugins','marketplace.json'),JSON.stringify(marketplace,null,2)+'\n');
const metadata=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
metadata.scripts={start:'npm --prefix .agents/plugins/codex-qq-bridge start',test:'npm --prefix .agents/plugins/codex-qq-bridge test','check:release':'npm --prefix .agents/plugins/codex-qq-bridge run check:release',bundle:'npm --prefix .agents/plugins/codex-qq-bridge run bundle'};
await writeFile(join(destination,'package.json'),JSON.stringify(metadata,null,2)+'\n');
for(const [file,script] of [['启动机器人.cmd','launcher.ps1'],['停止控制台.cmd','stop-console.ps1']])await writeFile(join(destination,file),'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0.agents\\plugins\\codex-qq-bridge\\scripts\\'+script+'"\r\nif errorlevel 1 pause\r\n');
await mkdir(join(destination,'.github','workflows'),{recursive:true});
let workflow=await readFile(join(root,'.github','workflows','ci.yml'),'utf8');
workflow=workflow.replace('    runs-on: windows-latest','    runs-on: windows-latest\n    defaults:\n      run:\n        working-directory: .agents/plugins/codex-qq-bridge').replaceAll('            dist/*.','            .agents/plugins/codex-qq-bridge/dist/*.');
await writeFile(join(destination,'.github','workflows','ci.yml'),workflow);
console.log(JSON.stringify({repository:destination,pluginFiles:files.length,version:metadata.version,pushed:false,published:false}));
