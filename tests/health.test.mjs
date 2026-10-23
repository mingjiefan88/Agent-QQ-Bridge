import assert from 'node:assert/strict';
import test from 'node:test';
import {createQqHealthProbe} from '../src/qq-health.js';
import {parseArgs} from '../bin/diagnose.mjs';

test('stale identity cannot prove online; QR state omits secrets and credential is cached',async()=>{
  let clock=Date.now(),mode='online',authCalls=0,calls=0;
  const fetcher=async(url,options)=>{
    calls++;
    let body;
    if(url.endsWith('/get_status')) {
      if(mode==='down')throw Error('unavailable');
      body={retcode:0,status:'ok',data:{online:mode==='online',good:true}};
    } else if(url.endsWith('/get_login_info'))body={retcode:0,status:'ok',data:{user_id:12345678,nickname:'Synthetic bot'}};
    else if(url.endsWith('/api/auth/login')){
      authCalls++;assert.ok(!options.body.includes('synthetic-secret'));
      body={code:0,data:{Credential:'synthetic-credential'}};
    } else if(url.endsWith('/CheckLoginStatus')){
      if(mode==='down')throw Error('unavailable');
      body={code:0,data:{isLogin:false,coreReady:false,loginPhase:'waiting_qrcode',qrcodeurl:'https://private.invalid/secret',loginError:'synthetic-secret'}};
    } else throw Error('Unexpected endpoint');
    return {ok:true,json:async()=>body};
  };
  const probe=createQqHealthProbe({oneBotBase:'http://127.0.0.1:3000',readWebUiToken:async()=> 'synthetic-secret',fetcher,now:()=>clock});
  assert.equal((await probe()).ok,true);assert.equal(authCalls,0);
  const count=calls;await probe();assert.equal(calls,count);
  mode='stale';clock+=6000;
  const stale=await probe();assert.equal(stale.ok,false);assert.equal(stale.selfId,null);assert.equal(stale.needsScan,true);
  assert.ok(!JSON.stringify(stale).includes('secret'));assert.ok(!JSON.stringify(stale).includes('private'));assert.equal(authCalls,1);
  clock+=6000;await probe();assert.equal(authCalls,1);
  mode='down';clock+=6000;assert.match((await probe()).lastError,/OneBot未连接/);
  mode='online';clock+=6000;assert.equal((await probe()).ok,true);
});

test('in-flight checks are coalesced',async()=>{
  let count=0,release;
  const gate=new Promise(r=>{release=r;});
  const probe=createQqHealthProbe({oneBotBase:'http://127.0.0.1:3000',fetcher:async(url)=>{
    count++;await gate;
    return {ok:true,json:async()=>({retcode:0,data:url.endsWith('/get_status')?{online:true,good:true}:{user_id:12345678}})};
  }});
  const a=probe(),b=probe();release();assert.equal((await a).ok,true);assert.equal((await b).ok,true);assert.equal(count,2);
});

test('CLI refuses remote endpoints, embedded credentials, paths and missing values',()=>{
  assert.equal(parseArgs([]).oneBotBase,'http://127.0.0.1:3000');
  for(const value of ['https://127.0.0.1:3000','http://remote.invalid','http://name:password@localhost:3000','http://localhost:3000/api','http://localhost:3000?token=x'])assert.throws(()=>parseArgs(['--onebot',value]));
  assert.throws(()=>parseArgs(['--webui']));assert.throws(()=>parseArgs(['--unknown','value']));
});
