import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
async function protocol(exe,args){return new Promise((resolve,reject)=>{const child=spawn(exe,args,{cwd:root,env:{...process.env,CODEX_QQ_HOME:join(tmpdir(),'codex-qq-mcp-check-unused')},windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});let output='',error='';const timer=setTimeout(()=>{child.kill();reject(Error('MCP handshake timeout '+error));},15000);child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);try{assert.equal(code,0,error);const rows=output.trim().split(/\r?\n/).map(x=>JSON.parse(x));assert.equal(rows[0].result.serverInfo.name,'codex-qq-bridge');assert.equal(rows[1].result.tools.length,4);assert.ok(rows[1].result.tools.every(x=>!x.name.includes('send')));assert.equal(rows[2].result,undefined);assert.equal(rows[2].error.code,-32601);resolve();}catch(e){reject(e);}});for(const packet of [{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'not-supported'}])child.stdin.write(JSON.stringify(packet)+'\n');child.stdin.end();});}
test('MCP stdio initialize/tools/error has clean JSON and no arbitrary send tool',()=>protocol(process.execPath,[join(root,'bin','mcp.mjs')]));
test('Windows plugin MCP wrapper forwards stdio without contaminating JSON',{skip:process.platform!=='win32'},()=>protocol('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'scripts','mcp.ps1')]));
