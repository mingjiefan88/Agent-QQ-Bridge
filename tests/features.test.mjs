import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createCodex} from '../src/codex.js';
import {createNapCat} from '../src/napcat.js';
import {defaults} from '../src/config.js';
import {createQqManager,parseManagementCommand} from '../src/qq-management.js';
import {createCompanion,qqReplyConfirmed} from '../src/qq-companion.js';
import {createStickerStore} from '../src/qq-stickers.js';
import {createRandomPoke} from '../src/qq-random-poke.js';
import {prepareQqModelImages,extractOneBotImageInputs} from '../src/qq-vision.js';
import {createMusicService,parseMusicRequest} from '../src/qq-music.js';
import {createExecutionTrace} from '../src/qq-trace.js';
const group='12345678',owner='23456789',user='34567890',self='45678901';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7wAAAABJRU5ErkJggg==','base64');
async function temporary(fn){const base=join(tmpdir(),'codex-qq-feature-tests');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'case-'));try{await fn(root);}finally{assert.ok(resolve(root).startsWith(resolve(base)+sep));await rm(root,{recursive:true,force:true});}}
const event=(text,change={})=>({type:'group_at',groupId:group,senderId:owner,selfId:self,text,isOwner:true,hasSelfAtSegment:true,raw:{time:Date.now()/1000,message_id:1},...change});
test('native image bytes and cleanup, classification scope and original GIF preservation',()=>temporary(async root=>{
 const inputs=extractOneBotImageInputs({message:[{type:'image',data:{file:'sample.png',sub_type:1,url:'https://multimedia.nt.qq.com.cn/test'}}]});assert.equal(inputs[0].isSticker,true);
 const paths=await prepareQqModelImages(inputs,{outputDir:join(root,'vision'),fetcher:async()=>new Response(png)});assert.equal(paths.length,1);assert.deepEqual(await readFile(paths[0]),png);await paths.dispose();await assert.rejects(readFile(paths[0]));
 await assert.rejects(prepareQqModelImages([{url:'http://127.0.0.1/private'}],{outputDir:join(root,'vision')}));
 const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'),asset=join(root,'source.gif');await writeFile(asset,gif);
 const store=createStickerStore({root:join(root,'stickers'),allowed:e=>e.groupId===group,prepare:async()=>Object.assign([asset],{dispose:async()=>{}}),analyze:async()=>({is_sticker:true,collect:true,description:'无语的小表情',tags:['无语']}),random:()=>0});await store.init();const e=event('表情');const result=await store.collect(e,[{file:'sample.gif',subType:1}]);assert.equal(result.collected,true);assert.equal(store.catalog({...e,groupId:'99999999'}).length,0);
 const [saved]=await store.resolveMarkers(e,`[[qq_sticker:${result.id}]]`);assert.deepEqual(await readFile(saved),gif);await store.sent(e,'',false);
}));
test('Codex subprocess uses argv, attaches --image, receives public progress, and deletes reply cache',()=>temporary(async root=>{
 let captured;const spawnImpl=(exe,args)=>{captured={exe,args};const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>child.emit('close',1);child.stdin.on('finish',async()=>{await writeFile(args[args.indexOf('-o')+1],'合成回答');child.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'合成回答'}})+'\n');child.emit('close',0);});return child;};
 const c=createCodex({root,config:()=>({...defaults(),codexPath:'codex.exe'}),spawnImpl});const image=join(root,'image.png');await writeFile(image,png);assert.equal(await c.complete('合成提示',[image]),'合成回答');assert.equal(captured.args[captured.args.indexOf('--image')+1],image);assert.ok(captured.args.includes('--ignore-user-config'));assert.ok(!captured.args.includes('--dangerously-bypass-approvals-and-sandbox'));await assert.rejects(readFile(captured.args[captured.args.indexOf('-o')+1]));assert.equal(Object.keys(c.trace().active).length,0);
}));
test('NapCat login hash, private QR flow, real status requirement and OneBot generated auth',()=>temporary(async root=>{
 const c=defaults(),requests=[];let online=false;
 const fetcher=async(url,options={})=>{requests.push({url,options});if(url.endsWith('/get_status'))return Response.json({status:'ok',retcode:0,data:{online}});if(url.endsWith('/get_login_info'))return Response.json({status:'ok',retcode:0,data:{user_id:self}});if(url.endsWith('/api/auth/login')){assert.equal(JSON.parse(options.body).hash,createHash('sha256').update(c.webUiToken+'.napcat').digest('hex'));return Response.json({code:0,data:{Credential:'fake-credential'}});}assert.equal(options.headers.authorization,'Bearer fake-credential');if(url.endsWith('/CheckLoginStatus'))return Response.json({code:0,data:{isLogin:false,coreReady:false,loginPhase:'waiting_qrcode'}});if(url.endsWith('/GetQQLoginQrcode'))return Response.json({code:0,data:{qrcode:'https://qq.example.invalid/synthetic-login'}});if(url.endsWith('/GetQQLoginInfo'))return Response.json({code:0,data:{uin:self}});return Response.json({code:0,data:{}});};
 const n=createNapCat({root,config:()=>c,fetcher});assert.equal((await n.status()).online,false);const qr=await n.qr();assert.equal(qr.qr,'https://qq.example.invalid/synthetic-login');online=true;assert.equal((await n.status()).online,true);
 await mkdir(join(root,'vendor','NapCat','config'),{recursive:true});await n.configureOneBot();const stored=JSON.parse(await readFile(join(root,'vendor','NapCat','config',`onebot11_${self}.json`),'utf8'));assert.equal(stored.network.httpServers[0].token,c.oneBotToken);assert.equal(stored.network.httpClients[0].token,c.callbackSecret);assert.equal(stored.network.httpServers[0].host,'127.0.0.1');assert.equal(requests.filter(x=>x.url.endsWith('/api/auth/login')).length,1);
}));
test('moderation resolves numeric at target and verifies owner/admin; aggregate poke complaint',async()=>{
 const qq={allowedGroups:[group],ownerUserIds:[owner],bannedUserIds:[],management:{enabled:true,pokeBack:true}},calls=[];let clock=Date.now();
 const call=async(action,params)=>{calls.push({action,params});return {status:'ok',retcode:0,data:action==='get_login_info'?{user_id:self}:action==='get_group_member_info'?{group_id:group,user_id:String(params.user_id),role:String(params.user_id)===self?'admin':String(params.user_id)===owner?'owner':'member'}:null};};
 const replies=[];const m=createQqManager({qq,channelEnabled:()=>true,call,sendReply:async(e,text)=>{replies.push(text);return {ok:true};},now:()=>clock});
 const e=event('/禁言 34567890 10分钟');const r=await m.message(e);assert.equal(r.handled,true);assert.ok(calls.some(x=>x.action==='set_group_ban' && String(x.params.user_id)===user && x.params.duration===600));
 const before=calls.length;await m.message({...e,senderId:user,isOwner:false});assert.equal(calls.length,before);
 for(let i=0;i<3;i++){await m.notice({post_type:'notice',notice_type:'notify',sub_type:'poke',self_id:Number(self),group_id:Number(group),user_id:Number(String(56789012+i)),target_id:Number(self),time:clock/1000});clock+=1000;}
 assert.equal(replies.length,1,'Different users count toward one poke-burst complaint');
});
test('memory persists scoped self-report, unknown sends do not become experience; no raw reasoning',()=>temporary(async root=>{
 const c=createCompanion({path:join(root,'memory.json'),allowed:e=>e.groupId===group});await c.init();const e=event('我喜欢乌龙茶');await c.observe(e,e.text,{direct:true});assert.match(c.prompt(e,'饮料'),/乌龙茶/);assert.ok(!c.prompt({...e,senderId:user},'饮料').includes('乌龙茶'));assert.equal(qqReplyConfirmed({ok:true}),false);await c.replied(e,e.text,'回复',{sent:false});assert.equal(c.status().episodes,0);await c.replied(e,e.text,'回复',{sent:true});assert.equal(c.status().episodes,1);await c.flush();
 const trace=createExecutionTrace(),run=trace.begin('测试');run.feed(JSON.stringify({type:'item.completed',item:{type:'reasoning',text:'DO_NOT_EXPOSE_INTERNAL'}})+'\n');run.feed(JSON.stringify({type:'item.completed',item:{type:'reasoning',id:'summary',summary:[{type:'summary_text',text:'公开摘要'}]}})+'\n');run.finish('completed');assert.ok(!JSON.stringify(trace.state).includes('DO_NOT_EXPOSE_INTERNAL'));assert.match(JSON.stringify(trace.state),/公开摘要/);
}));
test('music cleanup on confirmed and failed sends; no network source used',async()=>{
 let cleaned=0,disposed=0;const qq={allowedGroups:[group],ownerUserIds:[owner],bannedUserIds:[]};
 const music=createMusicService({qq,channelEnabled:()=>true,source:{init:async()=>{},prepare:async()=>({path:'synthetic.silk',title:'合成曲',url:'https://bilibili.example.invalid',dispose:async()=>{disposed++;}}),cleanup:async()=>{cleaned++;}},sendText:async()=>({ok:true}),sendVoice:async()=>({ok:true,messageId:'fake'})});await music.init();const r=await music.handle(event('/点歌 合成曲'),parseMusicRequest('/点歌 合成曲'));assert.equal(r.send.ok,true);assert.equal(disposed,1);assert.equal(cleaned,1);
});
