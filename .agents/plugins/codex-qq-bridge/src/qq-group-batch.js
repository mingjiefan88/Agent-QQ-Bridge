export function createChatBudget({now=Date.now,limit=4,windowMs=300000,minIntervalMs=30000}={}){
 const groups=new Map();
 function calls(id){const list=(groups.get(String(id)) || []).filter(at=>now()-at<windowMs);if(list.length)groups.set(String(id),list);else groups.delete(String(id));return list;}
 return {
  delay(id){const list=calls(id);return list.length>=limit?0:Math.max(0,(list.at(-1) ?? -Infinity)+minIntervalMs-now());},
  reserve(id){const list=calls(id);if(list.length>=limit)return {ok:false,reason:'budget'};if(list.length && now()-list.at(-1)<minIntervalMs)return {ok:false,reason:'cooldown'};list.push(now());groups.set(String(id),list);return {ok:true};},
  status:()=>({limit,windowMs,minIntervalMs,groups:Object.fromEntries([...groups.keys()].map(id=>[id,{used:calls(id).length}]))})
 };
}

// This timer runs before model invocation: busy bursts cost one call, not one per message.
export function createGroupBatcher({flush,busy=()=>false,defer=()=>0,now=Date.now,quietMs=2000,busyQuietMs=6000,burstCount=4,burstWindowMs=10000,maxMessages=100,maxAgeMs=120000,schedule=setTimeout,unschedule=clearTimeout,onError=()=>{}}){
 const groups=new Map();
 function arm(id,state,delay){unschedule(state.timer);state.timer=schedule(()=>void finish(id,state),delay);state.timer?.unref?.();}
 async function finish(id,state){
  if(groups.get(id)!==state)return;
  const quiet=state.hotUntil>now()?busyQuietMs:quietMs,remaining=quiet-(now()-state.lastAt),postpone=defer(id,state.messages.map(item=>item.raw));
  if(remaining>0 || busy(id) || postpone>0){arm(id,state,Math.max(remaining,postpone,busy(id)?quiet:0,1));return;}
  groups.delete(id);const messages=state.messages.filter(item=>now()-item.at<maxAgeMs).map(item=>item.raw);
  if(messages.length)try{await flush(id,messages);}catch(error){onError(error);}
 }
 return {
  push(raw){const id=String(raw.group_id),at=now();let state=groups.get(id);if(!state){state={messages:[],times:[],lastAt:at,hotUntil:0,timer:null};groups.set(id,state);}state.lastAt=at;state.times=state.times.filter(t=>at-t<burstWindowMs);state.times.push(at);if(state.times.length>=burstCount)state.hotUntil=at+burstWindowMs;state.messages.push({raw,at});state.messages=state.messages.filter(item=>at-item.at<maxAgeMs).slice(-maxMessages);arm(id,state,state.hotUntil>at?busyQuietMs:quietMs);},
  clear(id){const state=groups.get(String(id));if(state)unschedule(state.timer);groups.delete(String(id));},
  clearAll(){for(const state of groups.values())unschedule(state.timer);groups.clear();},
  status:()=>({pendingGroups:groups.size,pendingMessages:[...groups.values()].reduce((n,s)=>n+s.messages.length,0),quietMs,busyQuietMs})
 };
}
