#!/usr/bin/env node
import {dataHome} from '../src/config.js';
import {createBridge} from '../src/server.js';
const root=dataHome();
const bridge=await createBridge({root,port:process.env.CODEX_QQ_PORT?Number(process.env.CODEX_QQ_PORT):undefined});
const address=await bridge.listen();
console.log(`Codex QQ Bridge: http://127.0.0.1:${address.port}`);
if(process.argv.includes('--auto-start'))void bridge.autoStart.start();
let closing=false;async function close(){if(closing)return;closing=true;await bridge.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
