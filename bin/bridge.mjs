#!/usr/bin/env node
import {dataHome} from '../src/config.js';
import {createBridge} from '../src/server.js';
const root=dataHome();
const bridge=await createBridge({root,port:process.env.CODEX_QQ_PORT?Number(process.env.CODEX_QQ_PORT):undefined});
const address=await bridge.listen();
console.log(`Codex QQ Bridge: http://127.0.0.1:${address.port}`);
if(process.argv.includes('--auto-start') && bridge.snapshot().config.completed){
  void (async()=>{try{let health=await bridge.napcat.status();if(!health.online){await bridge.napcat.start();for(let attempt=0;attempt<15;attempt++){await new Promise(resolve=>setTimeout(resolve,1000));health=await bridge.napcat.status();if(health.online)break;}}if(health.online)await bridge.bot.start();}catch(error){console.error('自动启动未完成，请在控制台处理：'+error.message);}})();
}
let closing=false;async function close(){if(closing)return;closing=true;await bridge.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
