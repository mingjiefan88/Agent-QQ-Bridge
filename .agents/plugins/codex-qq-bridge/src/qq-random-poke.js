import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

const id=value=>/^[1-9]\d{4,15}$/.test(String(value || ''));
export function createRandomPoke({path,qq,channelEnabled,call,social=()=>({}),busy=()=>false,now=Date.now,random=Math.random}) {
  let data={version:1,enabled:true,groups:{}},saving=Promise.resolve();
  const active=new Map(),locks=new Set();
  const stats={attempts:0,sent:0,failures:0,lastError:null};
  const allowed=e=>channelEnabled() && e.groupId && qq.allowedGroups.includes(String(e.groupId)) && !qq.isQuiet?.(e.groupId) && id(e.senderId) && !qq.bannedUserIds?.includes(String(e.senderId)) && String(e.senderId)!==String(e.selfId);
  function group(key){return data.groups[key] ||= {enabled:true,lastAt:0,lastAttempt:0,day:'',count:0,targets:{},optOut:[]};}
  function save(){const body=JSON.stringify(data,null,2);saving=saving.catch(()=>{}).then(async()=>{const temp=path+'.'+randomUUID()+'.tmp';try{await writeFile(temp,body,{mode:0o600});await rename(temp,path);}catch(error){await unlink(temp).catch(()=>{});throw error;}});return saving;}
  async function api(action,params={}) {const response=await call(action,params);if(response?.status!=='ok' || response.retcode!==0)throw Error('QQ随机戳操作未确认');return response.data;}
  return {
    async init(){await mkdir(dirname(path),{recursive:true});try{const loaded=JSON.parse(await readFile(path,'utf8'));if(loaded.version!==1 || typeof loaded.enabled!=='boolean' || !loaded.groups || typeof loaded.groups!=='object' || Array.isArray(loaded.groups))throw Error('Invalid social state');for(const [key,g] of Object.entries(loaded.groups)){if(!id(key) || !Array.isArray(g.optOut) || !g.targets || Array.isArray(g.targets) || !Number.isFinite(g.lastAt) || !Number.isFinite(g.lastAttempt) || !Number.isFinite(g.count))throw Error('Invalid social group');}data=loaded;}catch(error){if(error.code!=='ENOENT')throw Error('随机戳配置读取失败，原文件已保留');await save();}},
    status:()=>({enabled:data.enabled,...stats,groups:Object.keys(data.groups).length}),
    async command(event,text){
      if(!allowed(event) || !/^\/(?:随机戳|别戳我|可以戳我)(?:\s|$)/.test(text))return null;
      const state=group(String(event.groupId));
      if(text==='/别戳我'){state.optOut=[...new Set([...state.optOut,String(event.senderId)])];await save();return '记住了，随机戳不会再选你；主动戳本小姐后的戳回仍由原开关控制。';}
      if(text==='/可以戳我'){state.optOut=state.optOut.filter(x=>x!==String(event.senderId));await save();return '好，你重新加入本群的随机戳候选。';}
      if(!event.isOwner)return '随机戳的开关只接受已绑定主人的指令；你可以发 /别戳我。';
      const action=text.replace(/^\/随机戳\s*/,'');
      if(['开','开启','关','关闭'].includes(action)){state.enabled=['开','开启'].includes(action);await save();return '本群随机戳已'+(state.enabled?'开启':'关闭')+'。';}
      return `本群随机戳${state.enabled?'开启':'关闭'}：聊天时4%候选概率，每群30分钟/同人2小时/每天最多4次，00:00—08:00不主动戳。/随机戳 开、/随机戳 关；成员可发 /别戳我。`;
    },
    async onMessage(event,text){
      if(!allowed(event) || !data.enabled || event.type!=='group_message' || event.hasAtSegment || event.hasReplySegment || event.hasAudioSegment || /^\//.test(text) || !/[\p{L}\p{N}]{2}/u.test(text) || text.length>500 || /https?:|密钥|密码|验证码|转账|禁言|生图|点歌/.test(text))return {skipped:true};
      if(event.raw?.time && (!Number.isFinite(Number(event.raw.time)) || Math.abs(now()-Number(event.raw.time)*1000)>120000))return {skipped:true};
      const key=String(event.groupId),state=group(key),at=now();
      const members=active.get(key) || new Map();
      for(const [user,item] of members)if(at-item.at>600000)members.delete(user);
      members.set(String(event.senderId),{at,event:{type:event.type,groupId:key,senderId:String(event.senderId),selfId:event.selfId},text});while(members.size>100)members.delete(members.keys().next().value);active.set(key,members);
      const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(at));
      if(!state.enabled || hour<8 || locks.has(key) || busy() || social(event,text)?.suppressReason)return {skipped:true};
      if(state.lastAt && at-state.lastAt<1800000 || state.lastAttempt && at-state.lastAttempt<300000 || qq.proactive?.inFlight?.[key] || at-Number(qq.proactive?.lastGroupReplyAt?.[key] || 0)<30000)return {skipped:true};
      const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(at);
      if(state.day!==day){state.day=day;state.count=0;}
      if(state.count>=4 || random()>=0.04)return {skipped:true};
      const candidates=[...members].filter(([user,item])=>!state.optOut.includes(user) && !qq.bannedUserIds?.includes(user) && user!==String(event.selfId) && (!state.targets[user] || at-state.targets[user]>=7200000) && !social(item.event,item.text)?.suppressReason);
      if(!candidates.length)return {skipped:true};
      const target=candidates[Math.min(candidates.length-1,Math.floor(random()*candidates.length))][0];
      locks.add(key);stats.attempts++;
      try {
        // Persist reservation before the external action; uncertain results are never retried.
        state.lastAttempt=at;state.lastAt=at;state.targets[target]=at;state.count++;await save();
        const [connection,account,member]=await Promise.all([api('get_status'),api('get_login_info'),api('get_group_member_info',{group_id:key,user_id:target,no_cache:true})]);
        if(connection?.online!==true || connection.good===false || String(account?.user_id)!==String(event.selfId) || String(member?.group_id)!==key || String(member?.user_id)!==target)throw Error('QQ在线或群成员身份未核验');
        if(!allowed(event) || !state.enabled || state.optOut.includes(target) || qq.bannedUserIds?.includes(target) || busy())return {skipped:true};
        await api('send_poke',{group_id:key,user_id:target});
        for(const [user,time] of Object.entries(state.targets))if(at-time>86400000)delete state.targets[user];
        stats.sent++;stats.lastError=null;await save();console.log('[随机戳] 已完成一次低频随机戳');return {sent:true};
      }catch{stats.failures++;stats.lastError='随机戳未确认，已退避，不会自动补戳';console.log('[随机戳] 未确认，停止本次尝试');return {sent:false};}
      finally{locks.delete(key);}
    },
    flush:()=>saving.catch(()=>{})
  };
}
