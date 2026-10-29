import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {defaults,saveConfig,loadConfig,validateConfig,publicConfig} from '../src/config.js';
import {createBot} from '../src/bot.js';
import {createBridge} from '../src/server.js';
import {createConversationWindow} from '../src/qq-conversation.js';
const group='12345678',owner='23456789',user='34567890',self='45678901';
async function temporary(fn){const base=join(tmpdir(),'codex-qq-tests');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'case-'));try{await fn(root);}finally{assert.ok(resolve(root).startsWith(resolve(base)+sep));await rm(root,{recursive:true,force:true});}}
const waitFor=async predicate=>{for(let i=0;i<120;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Test wait timed out');};
test('generic defaults, input validation, atomic persistence and redaction',()=>temporary(async root=>{
 const c=await loadConfig(root);assert.deepEqual(c.ownerUserIds,[]);assert.deepEqual(c.allowedGroups,[]);assert.equal(c.features.proactive,false);assert.equal(c.features.management,false);
 assert.ok(c.callbackSecret.length>=24);assert.ok(!JSON.stringify(publicConfig(c)).includes(c.callbackSecret));
 await saveConfig(root,{...c,name:'测试机器人',ownerUserIds:[owner],allowedGroups:[group]});assert.equal((await loadConfig(root)).name,'测试机器人');
 assert.throws(()=>validateConfig({...c,port:c.oneBotPort}));assert.throws(()=>validateConfig({...c,ownerUserIds:['not-id']}));assert.throws(()=>validateConfig({...c,features:{...c.features,shell:true}}));
}));
test('actual bot: mentioned wake, repeated no-mention followups, group isolation, closing, dedup and verified owner role',()=>temporary(async root=>{
 const c={...defaults(),ownerUserIds:[owner],allowedGroups:[group]};let calls=0;const delivered=[],prompts=[];
 const codex={diagnose:async()=>({ok:true}),cancel:()=>{},runCli:async()=>{},complete:async prompt=>{calls++;prompts.push(prompt);return '这是延续上文的回复';}};
 const napcat={oneBot:()=> 'http://127.0.0.1:1',status:async()=>({online:true}),call:async(action,params)=>({status:'ok',retcode:0,data:action==='get_group_msg_history'?{messages:[]}:action==='get_group_member_info'?{group_id:Number(group),user_id:Number(owner),role:'owner'}:action==='send_group_msg'?(delivered.push(params),{message_id:1000+delivered.length}):{}})};
 const bot=await createBot({root,config:()=>c,codex,napcat});let seq=0;
 const message=(text,options={})=>({post_type:'message',message_type:'group',self_id:Number(self),group_id:Number(group),user_id:Number(owner),time:Date.now()/1000,message_id:++seq,sender:{nickname:'合成用户'},message:[...(options.at?[{type:'at',data:{qq:self}}]:[]),{type:'text',data:{text}}],...options.raw});
 try{
 await bot.start();const wake=message('聊聊角色配色',{at:true});await bot.accept(wake);await waitFor(()=>delivered.length===1 && bot.status().queued===0);
 assert.equal(bot.status().conversation.active,1);assert.match(prompts[0],/同时是本群群主/);
 await bot.accept(message('那改成蓝色呢'));await waitFor(()=>delivered.length===2 && bot.status().queued===0);
 await bot.accept(message('再具体一点'));await waitFor(()=>delivered.length===3 && bot.status().queued===0);assert.equal(calls,3);assert.match(prompts.at(-1),/持续对话/);
 assert.equal((await bot.accept(wake)).duplicate,true);assert.equal(delivered.length,3);
 await bot.accept(message('其他群的话',{raw:{group_id:99999999}}));await bot.accept(message('其他人说话',{raw:{user_id:Number(user)}}));await waitFor(()=>bot.status().queued===0);assert.equal(delivered.length,3);
 await bot.accept(message('不用回复了'));await waitFor(()=>bot.status().queued===0);assert.equal(bot.status().conversation.active,0);
 await bot.accept(message('随口一说'));await waitFor(()=>bot.status().queued===0);assert.equal(delivered.length,3);
 await bot.accept(message('旧消息',{at:true,raw:{time:(Date.now()-180000)/1000}}));assert.equal(delivered.length,3);
 bot.stop();await bot.accept(message('停止后不回复',{at:true}));assert.equal(delivered.length,3);
 }finally{bot.stop();await bot.flush();}
}));
test('actual HTTP: local host/origin, CSRF, authenticated callback, persistence, secrets, static UI and no arbitrary paths',()=>temporary(async root=>{
 let accepted=0,started=0;
 const napcatFactory=()=>({status:async()=>({online:false,phase:'waiting_qrcode'}),logs:async()=>[],call:async()=>({data:[]})});
 const botFactory=async()=>({accept:async()=>{accepted++;return {accepted:true};},start:async()=>{started++;},stop:()=>{},sync:()=>{},flush:async()=>{},status:()=>({enabled:false,active:0,queued:0})});
 const codexFactory=()=>({trace:()=>({active:{},events:[]}),cancel:()=>{},diagnose:async()=>({ok:true}),complete:async()=> 'synthetic'});
 const bridge=await createBridge({root,port:0,napcatFactory,botFactory,codexFactory});const address=await bridge.listen(),base=`http://127.0.0.1:${address.port}`;
 const request=(path,body,headers={})=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
 const {csrf}=await request('/api/session').then(r=>r.json());assert.ok(csrf);
 assert.equal((await request('/api/bot/start',{})).status,403);
 assert.equal((await request('/api/bot/start',{}, {'x-bridge-csrf':csrf,origin:'https://example.invalid'})).status,403);
 await request('/api/bot/start',{}, {'x-bridge-csrf':csrf});assert.equal(started,1);
 assert.equal((await request('/onebot/event',{})).status,401);const stored=await loadConfig(root);
 const data=await request('/api/state').then(r=>r.json());assert.ok(!JSON.stringify(data).includes(stored.callbackSecret));assert.ok(!JSON.stringify(data).includes(stored.oneBotToken));
 await request('/onebot/event',{post_type:'message'},{authorization:'Bearer '+stored.callbackSecret});assert.equal(accepted,1);
 const r=await request('/api/config',{name:'新名字',oneBotToken:'attacker'},{'x-bridge-csrf':csrf});assert.equal(r.status,200);assert.equal((await loadConfig(root)).oneBotToken,stored.oneBotToken);
 assert.equal((await request('/../config.json')).status,404);assert.equal((await request('/src/server.js')).status,404);
 const html=await request('/');assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await html.text(),/实时监控/);
 }finally{await bridge.close();}
}));
test('attention expires/renews, does not forge mentions, and rejects redirection',()=>{
 let now=1000;const c=createConversationWindow({allowed:e=>e.groupId===group,mentioned:e=>e.hasSelfAtSegment,now:()=>now});
 const wake={groupId:group,senderId:owner,selfId:self,text:'你好',hasSelfAtSegment:true};c.observe(wake);c.replied(wake,true);
 const follow={...wake,hasSelfAtSegment:false,text:'继续'};c.observe(follow);assert.equal(c.decision(follow).ok,true);assert.equal(follow.hasSelfAtSegment,false);
 now+=299000;c.replied(follow,true);now+=299000;const more={...follow};c.observe(more);assert.equal(c.decision(more).ok,true);now+=1001;assert.equal(c.decision(more).ok,false);
 const elsewhere={...follow,hasAtSegment:true};c.observe(elsewhere);assert.equal(c.decision(elsewhere).ok,false);
});
