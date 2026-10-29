import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createRandomPoke} from '../src/qq-random-poke.js';
import {createMusicService,parseMusicRequest} from '../src/qq-music.js';
const group='12345678',owner='23456789',user='34567890',bot='45678901';
test('random poke remains independent of moderation, respects opt-out and does not retry unknown delivery',async()=>{
 const base=join(tmpdir(),'codex-qq-poke-tests');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'case-'));let now=Date.parse('2026-10-29T02:00:00Z'),fail=false;const calls=[];
 const qq={allowedGroups:[group],ownerUserIds:[owner],bannedUserIds:[],management:{enabled:false},proactive:{lastGroupReplyAt:{},inFlight:{}}};
 const call=async(action,p)=>{calls.push(action);if(action==='send_poke' && fail)throw Error('unknown');return {status:'ok',retcode:0,data:action==='get_status'?{online:true,good:true}:action==='get_login_info'?{user_id:bot}:action==='get_group_member_info'?{group_id:group,user_id:p.user_id,role:'member'}:{}};};
 const e={type:'group_message',groupId:group,senderId:user,selfId:bot,text:'这个设计真好看',raw:{time:now/1000}};
 const make=file=>createRandomPoke({path:join(root,file),qq,channelEnabled:()=>true,call,now:()=>now,random:()=>0});
 try{const p=make('normal.json');await p.init();assert.equal((await p.onMessage(e,e.text)).sent,true);await p.onMessage(e,e.text);assert.equal(calls.filter(x=>x==='send_poke').length,1);const opt=make('opt.json');await opt.init();await opt.command(e,'/别戳我');assert.equal((await opt.onMessage(e,e.text)).sent,undefined);await opt.command(e,'/可以戳我');fail=true;await opt.onMessage(e,e.text);const count=calls.length;await opt.onMessage(e,e.text);assert.equal(calls.length,count,'Unknown result consumes cooldown; no automatic retry');}finally{assert.ok(resolve(root).startsWith(resolve(base)+sep));await rm(root,{recursive:true,force:true});}
});
test('failed voice receipt disposes audio and cleans cache without another voice send',async()=>{
 let disposed=0,cleaned=0,voices=0;const service=createMusicService({qq:{allowedGroups:[group],ownerUserIds:[owner],bannedUserIds:[]},channelEnabled:()=>true,source:{init:async()=>{},cleanup:async()=>{cleaned++;},prepare:async()=>({path:'synthetic.silk',title:'合成曲',dispose:async()=>{disposed++;}})},sendText:async()=>({ok:true}),sendVoice:async()=>{voices++;return {ok:false};}});
 const e={type:'group_at',groupId:group,senderId:owner,selfId:bot,raw:{time:Date.now()/1000}};const r=await service.handle(e,parseMusicRequest('/点歌 合成曲'));assert.ok(r.error);assert.equal(voices,1);assert.equal(disposed,1);assert.equal(cleaned,1);assert.equal(service.status().busy,false);
});
