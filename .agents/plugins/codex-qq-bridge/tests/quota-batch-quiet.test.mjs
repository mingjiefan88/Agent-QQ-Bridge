import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createGroupBatcher,createChatBudget} from '../src/qq-group-batch.js';
import {createQuietGroups,quietCommand} from '../src/qq-quiet.js';
import {createConversationWindow} from '../src/qq-conversation.js';
import {createBot} from '../src/bot.js';import {defaults} from '../src/config.js';
const group='12345678',owner='23456789',other='34567890',self='45678901';
const at=id=>({type:'at',data:{qq:id}}),text=value=>({type:'text',data:{text:value}});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<300;i++){if(fn())return;await pause(5);}throw Error('Timed out');}
function fakeClock(){let at=0,serial=0;const tasks=new Map();return {now:()=>at,schedule(fn,ms){const id=++serial;tasks.set(id,{fn,at:at+ms});return id;},unschedule:id=>tasks.delete(id),async tick(ms){const end=at+ms;for(;;){const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;at=next[1].at;tasks.delete(next[0]);next[1].fn();await Promise.resolve();await Promise.resolve();}at=end;await Promise.resolve();}};}
test('busy group waits for silence, merges whole burst once, isolates groups and cancels pending work',async()=>{
 const clock=fakeClock(),flushed=[];let busy=false;
 const batch=createGroupBatcher({...clock,quietMs:10,busyQuietMs:40,burstWindowMs:100,burstCount:3,flush:(id,messages)=>flushed.push({id,messages}),busy:()=>busy});
 batch.push({group_id:group,message_id:1});await clock.tick(3);batch.push({group_id:group,message_id:2});await clock.tick(3);batch.push({group_id:group,message_id:3});await clock.tick(39);assert.equal(flushed.length,0);await clock.tick(1);assert.deepEqual(flushed[0].messages.map(x=>x.message_id),[1,2,3]);
 busy=true;batch.push({group_id:group,message_id:4});await clock.tick(20);assert.equal(flushed.length,1);busy=false;await clock.tick(10);assert.equal(flushed.length,2);
 batch.push({group_id:group,message_id:5});batch.push({group_id:other,message_id:6});batch.clear(group);await clock.tick(40);assert.equal(flushed.length,3);assert.equal(flushed.at(-1).id,other);batch.clearAll();assert.equal(batch.status().pendingMessages,0);
});
test('group cost cap is reserved before model calls and remains independent between groups',()=>{
 let now=1000;const b=createChatBudget({now:()=>now});assert.equal(b.reserve(group).ok,true);assert.equal(b.reserve(group).reason,'cooldown');assert.equal(b.delay(group),30000);
 for(let i=0;i<3;i++){now+=30000;assert.equal(b.reserve(group).ok,true);}now+=30000;assert.equal(b.reserve(group).reason,'budget');assert.equal(b.reserve(other).ok,true);now+=300001;assert.equal(b.reserve(group).ok,true);
});
test('only explicit same-sender wake opens bounded followups; silence/failure still consumes a reserved attempt',()=>{
 let now=1000;const c=createConversationWindow({allowed:()=>true,mentioned:e=>e.hasSelfAtSegment,now:()=>now});const wake={groupId:group,senderId:owner,selfId:self,text:'聊配色',hasSelfAtSegment:true};c.observe(wake);c.replied(wake,true,{reply:'银白和浅紫合适。'});
 const fast={...wake,hasSelfAtSegment:false,text:'那蓝色呢？'};c.observe(fast);assert.equal(c.decision(fast).ok,false);now+=31000;const first={...fast};c.observe(first);assert.equal(c.decision(first).ok,true);c.requested(first);c.requested(first);assert.equal(c.status().automaticCalls,1);
 now+=31000;const second={...fast};c.observe(second);assert.equal(c.decision(second).ok,true);c.requested(second);now+=31000;const third={...fast};c.observe(third);assert.equal(c.decision(third).ok,false);assert.equal(c.status().automaticCalls,2);
 const action={...fast,text:'（尾巴沉下去）'};c.observe(action);assert.equal(c.decision(action).ok,false);const peer={...fast,senderId:other};c.observe(peer);assert.equal(c.decision(peer).ok,false);
});
async function fixture(run,complete){
 const root=await mkdtemp(join(tmpdir(),'qq-quota-quiet-'));let clock=Date.now(),seq=0,calls=0,cancelled=0;const delivered=[],prompts=[];
 const c={...defaults(),ownerUserIds:[owner],allowedGroups:[group],features:{...defaults().features,memory:false,proactive:false,stealStickers:false}};
 const codex={diagnose:async()=>({ok:true}),cancel(){cancelled++;},runCli:async()=>{},complete:async p=>{calls++;prompts.push(p);return complete?complete(p,calls):'银白配浅紫，一句话说明。';}};
 const napcat={oneBot:()=> 'http://127.0.0.1:1',status:async()=>({online:true}),call:async(action,p)=>({status:'ok',retcode:0,data:action==='get_group_msg_history'?{messages:[]}:action==='get_group_member_info'?{group_id:p.group_id,user_id:p.user_id,role:String(p.user_id)===owner?'owner':'member',card:'测试成员'}:action==='send_group_msg'?(delivered.push(p),{message_id:1000+delivered.length}):{}})};
 const make=()=>createBot({root,config:()=>c,codex,napcat,now:()=>clock,batchOptions:{now:Date.now,quietMs:5,busyQuietMs:12,burstCount:3},replyBudgetOptions:{minIntervalMs:0}});
 let bot=await make();await bot.start();const send=(parts,{who=owner,...extra}={})=>bot.accept({post_type:'message',message_type:'group',group_id:Number(group),self_id:Number(self),user_id:Number(who),message_id:++seq,time:clock/1000,sender:{nickname:who===owner?'主人':'其他成员'},message:typeof parts==='string'?[text(parts)]:parts,...extra});
 try{await run({get bot(){return bot;},send,delivered,prompts,get calls(){return calls;},get cancelled(){return cancelled;},advance:ms=>{clock+=ms;},async restart(){bot.stop();await bot.flush();bot=await make();await bot.start();}});}finally{bot.stop();await bot.flush();await rm(root,{recursive:true,force:true});}
}
test('actual bot merges a chat burst into one model call, reads late context and anchors the final topic',()=>fixture(async f=>{
 await f.send([at(self),text('聊聊龙娘配色')]);await f.send('还有尾巴的颜色');await f.send('龙角也想用银白',{who:other});await until(()=>f.bot.status().queued===0);assert.equal(f.calls,1);assert.equal(f.delivered.length,1);assert.match(f.prompts[0],/还有尾巴的颜色/);assert.match(f.prompts[0],/龙角也想用银白/);assert.equal(f.delivered[0].message.find(s=>s.type==='reply').data.id,'2');
 await f.send('那配色怎么选？',{who:other});await until(()=>f.bot.status().queued===0);assert.equal(f.calls,1,'Other people do not inherit this conversation');await f.send('那蓝色呢？');await pause(20);assert.equal(f.calls,1,'Immediate followup waits before any model invocation');f.advance(31000);await f.send('那尾巴用蓝色呢？');await until(()=>f.bot.status().queued===0);assert.equal(f.calls,2,'The pending followups merge into one call after cooldown');
}));
test('owner silence clears pending work, rejects impersonation, survives restart and resumes only on actual owner-at',()=>fixture(async f=>{
 assert.equal(quietCommand({text:'龙娘，别理他'}),true);assert.equal(quietCommand({text:'我上次说把尾巴收一收'}),false);
 await f.send('龙娘，别理他',{who:other,sender:{nickname:'主人'}});assert.deepEqual(f.bot.status().quietGroups,[]);
 await f.send([at(self),text('这个问题先等等')]);await f.send('把尾巴收一收');assert.deepEqual(f.bot.status().quietGroups,[group]);await pause(25);assert.equal(f.calls,0);assert.equal(f.delivered.length,0);
 await f.send([at(self),text('继续')],{who:other});await f.send('白龙娘，继续吧');await f.bot.accept({post_type:'notice',notice_type:'notify',sub_type:'poke',group_id:Number(group),self_id:Number(self),user_id:Number(other),target_id:Number(self),time:Date.now()/1000});await pause(20);assert.equal(f.calls,0);assert.equal(f.delivered.length,0);
 await f.restart();assert.deepEqual(f.bot.status().quietGroups,[group]);await f.send([at(self),text('继续聊配色')]);await until(()=>f.bot.status().queued===0);assert.deepEqual(f.bot.status().quietGroups,[]);assert.equal(f.calls,1);assert.equal(f.delivered.length,1);
 const command={post_type:'message',message_type:'group',group_id:Number(group),self_id:Number(self),user_id:Number(owner),message_id:9999,time:Date.now()/1000,message:[text('龙娘，别理他')]};await f.bot.accept(command);await f.send([at(self),text('继续')]);await until(()=>f.bot.status().queued===0);assert.equal((await f.bot.accept(command)).duplicate,true);assert.deepEqual(f.bot.status().quietGroups,[]);
}));
test('silence cancels an in-flight response and an old generation cannot leak after owner resumes',async()=>{
 let release;const gate=new Promise(r=>{release=r;});await fixture(async f=>{
  await f.send([at(self),text('开始问题')]);await until(()=>f.calls===1);await f.send('龙娘，别理他');assert.ok(f.cancelled>0);await f.send([at(self),text('新的问题')]);release('旧回复不应该发出');await until(()=>f.bot.status().queued===0);assert.equal(f.delivered.length,1);assert.ok(!JSON.stringify(f.delivered).includes('旧回复不应该发出'));
 },async(p,count)=>count===1?gate:'这是恢复后的新回复');
});
