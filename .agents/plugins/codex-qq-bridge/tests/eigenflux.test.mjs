import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createEigenFlux,publicEigenDraft,validEigenHandoff} from '../src/eigenflux.js';
import {createBridge} from '../src/server.js';
const url='https://www.eigenflux.ai/dashboard/handoff?ticket=TEST_TICKET#nonce=TEST_NONCE';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'qq-eigen-tests-'));let client;try{await fn(root,c=>{client=c;});}finally{client?.stop();await rm(root,{recursive:true,force:true});}}
test('handoff rejects arbitrary origins/missing nonce; drafts never inherit private QQ state',()=>{
 assert.equal(validEigenHandoff(url),url);for(const bad of ['https://evil.example/dashboard/handoff?ticket=x#nonce=y','http://eigenflux.ai/dashboard/handoff?ticket=x#nonce=y','https://www.eigenflux.ai/dashboard/handoff?ticket=x','https://user@eigenflux.ai/dashboard/handoff?ticket=x#nonce=y'])assert.throws(()=>validEigenHandoff(bad));
 const manual=publicEigenDraft({prefillConsent:false,name:'ignored',description:'ignored'});assert.equal(manual.identity_card.agent_name,'');assert.deepEqual(manual.intent_actions,[]);const draft=publicEigenDraft({prefillConsent:true,name:'Bridge $(literal)',description:'公开功能'});assert.equal(draft.identity_card.agent_name,'Bridge $(literal)');assert.equal(draft.identity_card.human_description,'');assert.deepEqual(draft.identity_card.seeking,[]);assert.ok(!JSON.stringify(draft).includes('human_input'));
});
test('actual feed.v2 previews render as bounded text with a safe broadcast source',()=>fixture(async(root,set)=>{
 let ready=false;const home=join(root,'eigenflux','.eigenflux');
 const client=await createEigenFlux({root,active:()=>false,runImpl:async args=>{
  const c=args.slice(args.indexOf('--format')+2);
  if(c[0]==='agent' && c[1]==='init')return {home};
  if(c[0]==='agent')return {home,runtime_identity_complete:true,runtime_host:'codex',mode:'plugin',console_url:url};
  if(c[0]==='heartbeat')return {access:{mode:'intent_aligned',onboarding_state:'completed'}};
  if(c[0]==='feed')return {schema_version:'feed.v2',personalization:{mode:ready?'intent_aligned':'baseline'},items:[{item_id:'public-item',preview:{text:'<script>untrusted</script> '+ 'x'.repeat(2000),truncated:false},author_identity:{agent_name:'Example'}}]};
  return {};
 }});set(client);
 await client.setup({scheduleConsent:true,executionConsent:true,prefillConsent:false});ready=true;await client.check();
 const result=await client.feed();assert.equal(result.count,1);assert.equal(result.items[0].content.length,1600);assert.match(result.items[0].title,/<script>untrusted/);assert.equal(result.items[0].url,'https://www.eigenflux.ai/dashboard/broadcasts/public-item');
}));

test('consent precedes identity/provision; incomplete website is not reported connected; ready access enables real reads',()=>fixture(async(root,set)=>{
 const calls=[],home=join(root,'eigenflux','.eigenflux');let ready=false,fail=false;
 const client=await createEigenFlux({root,config:()=>({persona:'PRIVATE_PERSONA',ownerUserIds:['12345678']}),active:()=>false,runImpl:async args=>{calls.push(args);assert.equal(args[args.indexOf('--homedir')+1],home);assert.equal(args[args.indexOf('--server')+1],'eigenflux');assert.ok(!args.join(' ').includes('PRIVATE_PERSONA'));const command=args.slice(args.indexOf('--format')+2);if(command[0]==='agent' && command[1]==='init')return {home};if(command[0]==='agent' && command[1]==='provision'){const d=JSON.parse(command[command.indexOf('--draft-json')+1]);assert.equal(d.identity_card.agent_name,'Public Bridge');return {home,runtime_identity_complete:true,runtime_host:'codex',mode:'plugin',console_url:url};}if(command[0]==='heartbeat'){if(fail)throw Error('test authentication expired');return {access:{onboarding_state:ready?'completed':'profile',mode:ready?'intent_aligned':'baseline'}};}if(command[0]==='feed')return {schema_version:'feed.v2',personalization:{mode:ready?'intent_aligned':'baseline'},items:[{id:'item',content:'A public signal',url:'https://example.com/source'}]};if(command[0]==='dashboard')return {console_url:url};return {};}});set(client);
 await assert.rejects(client.setup({scheduleConsent:true,executionConsent:false,prefillConsent:false}));assert.equal(calls.length,0);const result=await client.setup({scheduleConsent:true,executionConsent:true,prefillConsent:true,name:'Public Bridge',description:'公开说明'});assert.equal(result.url,url);assert.equal(client.status().stage,'website');assert.equal(client.status().connected,false);
 const incomplete=await client.check();assert.equal(incomplete.connected,false);assert.ok(!calls.some(x=>x.includes('context')));await assert.rejects(client.feed());
 ready=true;assert.equal((await client.check()).connected,true);const feed=await client.feed();assert.equal(feed.items[0].content,'A public signal');assert.equal(client.status().scheduledCheckEnabled,true);assert.equal((await client.dashboard()).url,url);
 assert.ok(!JSON.stringify(client.status()).includes('TEST_NONCE'));assert.ok(!JSON.stringify(client.status()).includes(root));assert.ok(!JSON.stringify(client.status()).includes('TEST_TICKET'));
 const before=calls.length;assert.match(await client.command({isOwner:false},'/Eigen动态'),/只接受/);assert.equal(calls.length,before);assert.match(await client.command({isOwner:true},'/Eigen状态'),/已接入/);
 fail=true;await assert.rejects(client.check());assert.equal(client.status().connected,false);assert.equal(client.status().stage,'error');const saved=JSON.parse(await readFile(join(root,'data','eigenflux.json'),'utf8'));assert.equal(saved.permissions.executionConsent,true);assert.ok(!JSON.stringify(saved).includes('TEST_TICKET'));
}));
test('scheduled robot checks respect service activity/pause and invoke only CLI reads, never Codex',()=>fixture(async(root,set)=>{
 let clock=1000,active=false,ready=false;const calls=[],home=join(root,'eigenflux','.eigenflux');
 const client=await createEigenFlux({root,now:()=>clock,intervalMs:100,timerIntervalMs:5,active:()=>active,runImpl:async a=>{calls.push(a);const c=a.slice(a.indexOf('--format')+2);if(c[0]==='agent' && c[1]==='init')return {home};if(c[0]==='agent')return {home,runtime_identity_complete:true,runtime_host:'codex',mode:'plugin',console_url:url};if(c[0]==='heartbeat')return {access:{onboarding_state:ready?'completed':'email',mode:ready?'intent_aligned':'baseline'}};if(c[0]==='feed')return {schema_version:'feed.v2',personalization:{mode:ready?'intent_aligned':'baseline'},items:[]};return {};}});set(client);
 await client.setup({scheduleConsent:true,executionConsent:true,prefillConsent:false});ready=true;await client.check();const initial=calls.length;clock+=101;await wait(25);assert.equal(calls.length,initial);active=true;await wait(40);assert.ok(calls.some(a=>a[a.indexOf('--origin')+1]==='heartbeat' && a.includes('poll')));assert.ok(calls.every(a=>!a.includes('publish') && !a.includes('send')));await client.pause();const paused=calls.length;clock+=1000;await wait(25);assert.equal(calls.length,paused);await client.resume();assert.equal(client.status().scheduledCheckEnabled,true);
}));
test('bridge protects EigenFlux mutations with existing CSRF and serves icon assets safely',()=>fixture(async(root)=>{
 let installs=0;const eigenfluxFactory=async()=>({status:()=>({installed:false,connected:false,stage:'not_installed'}),install:async()=>{installs++;return {installed:true};},stop(){}});
 const botFactory=async()=>({status:()=>({enabled:false,active:0,queued:0}),sync(){},stop(){},flush:async()=>{},accept:async()=>({})});
 const codexFactory=()=>({trace:()=>({active:{},events:[]}),cancel(){}}),napcatFactory=()=>({status:async()=>({online:false})});
 const bridge=await createBridge({root,port:0,eigenfluxFactory,botFactory,codexFactory,napcatFactory});const address=await bridge.listen(),base='http://127.0.0.1:'+address.port;
 try{const session=await fetch(base+'/api/session').then(r=>r.json());assert.equal((await fetch(base+'/api/eigenflux/install',{method:'POST',body:'{}'})).status,403);const r=await fetch(base+'/api/eigenflux/install',{method:'POST',headers:{'x-bridge-csrf':session.csrf,'content-type':'application/json'},body:'{}'});assert.equal(r.status,200);assert.equal(installs,1);const icon=await fetch(base+'/favicon.ico');assert.match(icon.headers.get('content-type'),/image/);assert.deepEqual([...new Uint8Array(await icon.arrayBuffer()).slice(0,4)],[0,0,1,0]);assert.equal((await fetch(base+'/third_party/eigenflux.lock.json')).status,404);}finally{await bridge.close();}
}));
