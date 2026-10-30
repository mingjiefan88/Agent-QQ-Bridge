import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutoStarter} from '../src/auto-start.js';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await delay(5);}throw Error('Timed out');};
test('one click waits for delayed QQ and Codex login, then enables exactly once',async()=>{
 let online=false,authorized=false,enabled=false,starts=0,attempts=0;
 const auto=createAutoStarter({config:()=>({completed:true}),intervalMs:5,
  napcat:{status:async()=>({online,phase:online?'ready':'waiting_qrcode'}),start:async()=>{starts++;}},
  bot:{status:()=>({enabled}),start:async({shouldEnable})=>{attempts++;if(!authorized)throw Error('Codex未登录');if(shouldEnable())enabled=true;}}});
 try{await auto.start();assert.equal(auto.status().pending,true);assert.equal(starts,0);online=true;await until(()=>attempts>0);assert.equal(enabled,false);authorized=true;await until(()=>enabled);assert.equal(auto.status().pending,false);const count=attempts;await delay(20);assert.equal(attempts,count);}finally{auto.cancel();}
});
test('pause cancels pending start even while login checks are in flight',async()=>{
 let release,enabled=false,entered=false;const gate=new Promise(resolve=>{release=resolve;});
 const auto=createAutoStarter({config:()=>({completed:true}),intervalMs:5,napcat:{status:async()=>({online:true})},
  bot:{status:()=>({enabled}),start:async({shouldEnable})=>{entered=true;await gate;if(shouldEnable())enabled=true;}}});
 const starting=auto.start();await until(()=>entered);auto.cancel();release();await starting;await delay(20);assert.equal(enabled,false);assert.equal(auto.status().pending,false);
});
