import {oneBotSegments} from './qq-vision.js';
const valid=id=>/^[1-9]\d{4,15}$/.test(String(id));
const label=value=>String(value || '').replace(/\[CQ:[^\]]*\]/g,'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,60);
export function mentionTargets(message){return [...new Set(oneBotSegments(message).filter(s=>s?.type==='at').map(s=>String(s.data?.qq)).filter(id=>id==='all' || valid(id)))];}
export function mentionText(message,{selfId,omitSelf=false}={}){
 return oneBotSegments(message).map(s=>{
  if(s?.type==='text')return String(s.data?.text || '');
  if(s?.type!=='at')return '';
  const id=String(s.data?.qq);
  if(id==='all')return ' @全体成员 ';
  if(!valid(id))return '';
  return id===String(selfId)?omitSelf?' ':` @机器人(QQ:${id}) `:` @QQ:${id} `;
 }).join('').replace(/\s+/g,' ').trim();
}
export function createMentionResolver({call,now=Date.now}){
 const cache=new Map();
 return async event=>{
  const ids=[...new Set(event.atTargets || [])].slice(0,8);
  return Promise.all(ids.map(async id=>{
   if(id==='all')return {kind:'all',name:'全体成员'};
   if(!valid(id))return null;
   if(id===String(event.selfId))return {qq:id,kind:'bot'};
   const result={qq:id,kind:'member'};
   if(!event.groupId)return result;
   const key=event.groupId+':'+id,old=cache.get(key);if(old && old.expires>now())return old.value;
   try{
    const response=await call('get_group_member_info',{group_id:Number(event.groupId),user_id:Number(id),no_cache:false}),m=response.data;
    if(response.retcode!==0 || String(m?.user_id)!==id || String(m?.group_id)!==String(event.groupId))throw Error('Member identity mismatch');
    result.name=label(m.card || m.nickname) || undefined;
   }catch{/* The actual QQ ID remains available even if a name cannot be fetched. */}
   cache.set(key,{value:result,expires:now()+(result.name?300000:30000)});while(cache.size>256)cache.delete(cache.keys().next().value);
   return result;
  })).then(list=>list.filter(Boolean));
 };
}
