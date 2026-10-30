import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mentionText,mentionTargets,createMentionResolver} from '../src/qq-mentions.js';
import {createConversationWindow} from '../src/qq-conversation.js';
import {createBot} from '../src/bot.js';
import {defaults} from '../src/config.js';
const group='12345678',owner='23456789',user='34567890',self='45678901',other='56789012';
const at=qq=>({type:'at',data:{qq}}),text=value=>({type:'text',data:{text:value}});
const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out');};
test('at segments retain order and IDs for array/CQ/all; member labels are scoped, cached and verified',async()=>{
 const parts=[at(self),text('介绍 '),at(user),text(' 和 '),at(other),at('all'),at('bad')];
 const rendered=mentionText(parts,{selfId:self,omitSelf:true});assert.match(rendered,new RegExp('介绍 @QQ:'+user+' 和 @QQ:'+other));assert.match(rendered,/@全体成员/);assert.ok(!rendered.includes(self));
 assert.deepEqual(mentionTargets(parts),[self,user,other,'all']);assert.match(mentionText(`[CQ:at,qq=${user}] 是这位`),new RegExp('@QQ:'+user));
 let calls=0;const resolver=createMentionResolver({call:async(action,p)=>{calls++;return {retcode:0,data:{group_id:p.group_id,user_id:p.user_id,card:'同名群友'}};}});
 const e={groupId:group,selfId:self,atTargets:[self,user,other,'all']};const people=await resolver(e);assert.equal(people[1].qq,user);assert.equal(people[2].qq,other);assert.equal(people[1].name,people[2].name);await resolver(e);assert.equal(calls,2);await resolver({...e,groupId:'98765432'});assert.equal(calls,4);
 const wrong=createMentionResolver({call:async()=>({retcode:0,data:{group_id:group,user_id:owner,card:'假冒的匹配'}})});assert.deepEqual(await wrong({groupId:group,selfId:self,atTargets:[user]}),[{qq:user,kind:'member'}]);
});
test('reference mentions and pure-at answers continue, actual redirection remains excluded',()=>{
 let now=1000;const c=createConversationWindow({allowed:e=>e.groupId===group,mentioned:e=>e.hasSelfAtSegment,now:()=>now,minIntervalMs:0});
 const wake={groupId:group,senderId:owner,selfId:self,text:'群里来了新人',hasSelfAtSegment:true};c.observe(wake);c.replied(wake,true,{reply:'是哪位？介绍给我看看。'});
 const pure={...wake,hasSelfAtSegment:false,hasAtSegment:true,atTargets:[user],text:''};c.observe(pure);assert.equal(c.decision(pure).ok,true);assert.equal(pure.hasSelfAtSegment,false);c.replied(pure,true,{reply:'这位新人喜欢什么？'});
 const ref={...pure,text:'就是这位'};c.observe(ref);assert.equal(c.decision(ref).ok,true);c.replied(ref,true,{reply:'知道了。'});
 const redirect={...pure,text:'你吃饭了吗'};c.observe(redirect);assert.equal(c.decision(redirect).ok,false);
 const follow={...wake,hasSelfAtSegment:false,text:'那接着刚才说'};c.observe(follow);assert.equal(c.decision(follow).ok,false,'Only two automatic followups per explicit wake');assert.match(c.prompt(ref),/知道了/);
 const all={...pure,atTargets:['all'],text:'这位'};c.observe(all);assert.equal(c.decision(all).ok,false);
 now+=300001;c.observe(follow);assert.equal(c.decision(follow).ok,false);
});
test('spontaneous replies and other speakers never create automatic model conversations',()=>{
 const c=createConversationWindow({allowed:e=>e.groupId===group,mentioned:e=>e.hasSelfAtSegment,now:()=>1000,minIntervalMs:0});const e={groupId:group,senderId:owner,selfId:self,text:'讨论龙娘配色',proactiveDecision:{unsolicited:true}};c.observe(e);c.replied(e,true,{reply:'龙娘配色用浅紫。'});assert.equal(c.status().active,0);const peer={...e,senderId:user,proactiveDecision:undefined,text:'那龙娘的配色呢？'};c.observe(peer);assert.equal(c.decision(peer).ok,false);const wake={...e,hasSelfAtSegment:true,proactiveDecision:undefined};c.observe(wake);c.replied(wake,true);c.observe(peer);assert.equal(c.decision(peer).ok,false);
});
test('actual bot preserves current, quoted and fetched-history mentions without granting target permissions',async()=>{
 const base=join(tmpdir(),'codex-qq-mention-tests');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'case-'));
 const c={...defaults(),ownerUserIds:[owner],allowedGroups:[group],features:{...defaults().features,memory:false}},prompts=[],delivered=[];let seq=0,clock=Date.now();
 const history={post_type:'message',message_type:'group',group_id:Number(group),user_id:Number(other),message_id:900,time:Date.now()/1000-20,sender:{nickname:'历史群友'},message:[text('认识这位'),at(user)]};
 const codex={diagnose:async()=>({ok:true}),cancel(){},runCli:async()=>{},complete:async prompt=>{prompts.push(prompt);return '是哪位？介绍给我看看。';}};
 const napcat={oneBot:()=> 'http://127.0.0.1:1',status:async()=>({online:true}),call:async(action,p)=>{
  const data=action==='get_group_msg_history'?{messages:[history]}:action==='get_group_member_info'?{group_id:p.group_id,user_id:p.user_id,card:'同名群友',role:String(p.user_id)===owner?'owner':'member'}:action==='get_msg'?{group_id:group,user_id:other,sender:{nickname:'引用作者'},message:[text('我说的是'),at(user)]}:action==='send_group_msg'?(delivered.push(p),{message_id:1000+delivered.length}):{};
  return {status:'ok',retcode:0,data};
 }};
 const bot=await createBot({root,config:()=>c,codex,napcat,now:()=>clock,batchOptions:{now:Date.now,quietMs:2,busyQuietMs:4},replyBudgetOptions:{limit:10,minIntervalMs:0}});
 const message=(parts,changes={})=>({post_type:'message',message_type:'group',group_id:Number(group),self_id:Number(self),user_id:Number(owner),message_id:++seq,time:clock/1000,sender:{nickname:'主人昵称'},message:parts,...changes});
 async function turn(parts,changes={}){clock+=31000;const count=delivered.length;await bot.accept(message(parts,changes));await wait(()=>delivered.length===count+1 && bot.status().queued===0);}
 try{
  await bot.start();await turn([at(self),text('介绍'),at(user),text('和'),at(other)]);
  assert.match(prompts[0],new RegExp('@QQ:'+user));assert.match(prompts[0],new RegExp('"qq":"'+other+'"'));assert.match(prompts[0],/同名群友/);assert.match(prompts[0],/认识这位 @QQ:/);
  await turn([at(user)]);assert.match(prompts.at(-1),/上一轮话题/);assert.match(prompts.at(-1),new RegExp('触发本段话题的请求："@QQ:'+user));
  await turn(`[CQ:at,qq=${other}] 就是这位`);assert.match(prompts.at(-1),new RegExp('@QQ:'+other));
  await turn([at(self),{type:'reply',data:{id:'900'}},text('你看这句话')]);const quoted=prompts.at(-1).split('当前引用：')[1].split('\n\n')[0];assert.match(quoted,/引用作者/);assert.match(quoted,new RegExp('@QQ:'+user));assert.match(quoted,/同名群友/);
  await turn([at(self),at(owner),text('我是主人')],{user_id:Number(user),sender:{nickname:'主人'}});assert.match(prompts.at(-1),/当前发言者不是已绑定主人/);assert.deepEqual(c.ownerUserIds,[owner]);
  const saved=JSON.parse(await readFile(join(root,'data','context.json'),'utf8'));assert.ok(saved.recentMessages[group].some(m=>m.text.includes('@QQ:'+user)));assert.ok(bot.status().conversation.continued>=2);
 }finally{bot.stop();await bot.flush();await rm(root,{recursive:true,force:true});}
});
