// Attention is scoped to a real incoming group event and a confirmed outgoing reply.
// It never changes mention flags or grants command permissions.
export function createConversationWindow({allowed,mentioned,textOf=e=>e.text || '',now=Date.now,windowMs=300000}={}) {
  const sessions=new Map(), tickets=new WeakMap();
  const stats={opened:0,continued:0,closed:0};
  const keyOf=e=>`${e.groupId}:${e.senderId}`;
  const fresh=e=>!e.raw?.time || Math.abs(now()-Number(e.raw.time)*1000)<=120000;
  const eligible=e=>Boolean(e.groupId && e.senderId && String(e.senderId)!==String(e.selfId) && allowed(e));
  const elsewhere=e=>!mentioned(e) && (e.hasAtSegment || e.hasReplySegment);
  const words=t=>new Set(String(t).toLowerCase().match(/[a-z0-9]{2,}|[\p{Script=Han}]{2}/gu) || []);
  const sameTopic=(a,b)=>{const x=words(a);return [...words(b)].some(w=>x.has(w));};
  const isFollowup=t=>/^(?:那|这|它|她|他|你|所以|然后|还有|但是|不过|可是|为什么|怎么|能不能|可以|继续|再|对|是的|不是|嗯|好|行|不对|不行|不太|感觉|谢谢)/.test(t);
  function prune() {
    for(const [key,s] of sessions)if(s.expires<=now())sessions.delete(key);
    while(sessions.size>1000)sessions.delete(sessions.keys().next().value);
  }
  function observe(event) {
    prune();
    if(!eligible(event) || !fresh(event))return;
    const key=keyOf(event),text=String(textOf(event)).replace(/\[CQ:[^\]]*\]/g,'').trim();
    // Count only fresh, actual callback messages, not history backfills or duplicates.
    for(const [other,s] of sessions)if(s.group===String(event.groupId) && other!==key)s.intervening++;
    if(elsewhere(event))return;
    const close=/^(?:\/结束对话|先这样(?:吧)?|先不聊(?:了)?|不聊了|结束对话|我去忙(?:了)?|晚安|不用回(?:复)?(?:了)?|别回(?:复)?(?:了)?|不要回(?:复)?(?:了)?)[\s，,。.!！~～]*$/.test(text);
    if(close) {
      if(sessions.delete(key))stats.closed++;
      const quiet=/^(?:\/结束对话|不用回|别回|不要回)/.test(text);
      tickets.set(event,{close:true,quiet});
      return;
    }
    let session=sessions.get(key);
    if(mentioned(event)) {
      if(!session) {
        session={group:String(event.groupId),expires:now()+windowMs,active:false,topic:text,intervening:0};
        sessions.set(key,session);
      }
      tickets.set(event,{key,session,direct:true,text});
      return;
    }
    if(!session?.active)return;
    if(session.intervening>=8 && text && !isFollowup(text) && !sameTopic(text,session.topic)) {
      sessions.delete(key);stats.closed++;
      tickets.set(event,{close:true,quiet:false});return;
    }
    if(event.hasAudioSegment || /\[CQ:(?:record|voice|audio),/i.test(event.text || ''))return;
    tickets.set(event,{key,session,followup:true,text});
  }
  function decision(event) {
    const ticket=tickets.get(event);
    if(!eligible(event) || !ticket)return {ok:false};
    if(ticket.close)return {ok:false,quiet:ticket.quiet,closed:true,reason:'Conversation ended'};
    if(!ticket.followup || sessions.get(ticket.key)!==ticket.session || ticket.session.expires<=now())return {ok:false};
    return {ok:true,conversation:true,reason:'Active conversation followup'};
  }
  function replied(event,confirmed,{failed=false}={}) {
    const ticket=tickets.get(event);
    if(!confirmed || failed || !eligible(event) || !ticket || ticket.close || (!ticket.direct && !ticket.followup) || event.proactiveDecision?.unsolicited)return;
    const session=sessions.get(ticket.key);
    if(session!==ticket.session || session.expires<=now())return;
    if(!session.active)stats.opened++;
    else if(ticket.followup)stats.continued++;
    session.active=true;session.expires=now()+windowMs;session.intervening=0;
    session.topic=ticket.text || session.topic;
  }
  return {observe,decision,replied,prompt:event=>decision(event).ok?'当前发送者正在接着你上一轮回复聊天，这是已唤醒的持续对话。结合最近上下文自然继续，不要要求对方每句话都重新 @ 你。原有身份和功能权限仍然有效。':'',
    status:()=>{prune();return {enabled:true,windowMs,active:[...sessions.values()].filter(s=>s.active).length,...stats};}};
}
