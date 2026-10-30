// Attention is scoped to a real incoming group event and a confirmed outgoing reply.
// It never changes mention flags or grants command permissions.
export function createConversationWindow({allowed,mentioned,textOf=e=>e.text || '',now=Date.now,windowMs=120000,minIntervalMs=30000,maxFollowups=2,groupBudget=3,groupWindowMs=300000}={}) {
  const sessions=new Map(), tickets=new WeakMap(), budgets=new Map();
  const stats={opened:0,continued:0,closed:0,automaticCalls:0,rateLimited:0};
  const keyOf=e=>`${e.groupId}:${e.senderId}`;
  const fresh=e=>!e.raw?.time || Math.abs(now()-Number(e.raw.time)*1000)<=120000;
  const eligible=e=>Boolean(e.groupId && e.senderId && String(e.senderId)!==String(e.selfId) && allowed(e));
  const filler=new Set(['这个','那个','一个','一下','我们','你们','他们','怎么','什么','可以','还有','的话','感觉','觉得','因为','所以','然后','刚才','这位']);
  const words=t=>{const value=String(t).toLowerCase(),result=value.match(/[a-z0-9]{3,}/g) || [];for(const [block] of value.matchAll(/[\p{Script=Han}]{2,}/gu))for(let i=0;i<block.length-1;i++){const w=block.slice(i,i+2);if(!filler.has(w))result.push(w);}return new Set(result);};
  const topicScore=(a,b)=>{const x=words(a);return [...words(b)].filter(w=>x.has(w)).length;};
  const sameTopic=(a,b)=>topicScore(a,b)>0;
  const referent=(e,text,session)=>Boolean(session?.active && !(e.atTargets || []).includes('all') && (
    /这位|那位|这个人|这名|这人|说的是|指的是|新人|(?:就是|是)[他她]|[他她]是谁|你看|你觉得|评价|介绍|这句话|这条消息/.test(text) ||
    !text && /哪位|是谁|介绍|名字|哪一个|谁|@/.test(session.lastReply || '')
  ));
  const elsewhere=(e,text,session)=>!mentioned(e) && (e.hasAtSegment || e.hasReplySegment) && !referent(e,text,session);
  const isFollowup=t=>/^(?:那|这|它|她|他|你|所以|然后|还有|但是|不过|可是|为什么|怎么|能不能|可以|继续|再|对|是的|不是|嗯|好|行|不对|不行|不太|感觉|谢谢)/.test(t);
  const idle=t=>/^(?:[（(][^\n]{0,100}[）)]|嗯+|哦+|噢+|好(?:的|呀|吧)?|行|收到|明白(?:了)?|知道(?:了)?|谢谢(?:你)?|哈哈+|确实|对|是的|喵)[\s，,。.!！~～]*$/.test(t);
  function groupCalls(group){const recent=(budgets.get(group) || []).filter(at=>now()-at<groupWindowMs);if(recent.length)budgets.set(group,recent);else budgets.delete(group);return recent;}
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
    let session=sessions.get(key);
    if(elsewhere(event,text,session))return;
    const close=/^(?:\/结束对话|先这样(?:吧)?|先不聊(?:了)?|不聊了|结束对话|我去忙(?:了)?|晚安|不用回(?:复)?(?:了)?|别回(?:复)?(?:了)?|不要回(?:复)?(?:了)?|(?:我|这回)?(?:先|真)?潜(?:水)?(?:了)?(?:喵)?)[\s，,。.!！~～]*$/.test(text);
    if(close) {
      if(sessions.delete(key))stats.closed++;
      const quiet=/^(?:\/结束对话|不用回|别回|不要回)/.test(text);
      tickets.set(event,{close:true,quiet});
      return;
    }
    if(mentioned(event)) {
      if(!session) {
        session={group:String(event.groupId),expires:now()+windowMs,active:false,topic:text,intervening:0};
        sessions.set(key,session);
      }
      tickets.set(event,{key,session,direct:true,text});
      return;
    }
    if(!session?.active || idle(text))return;
    if(session.intervening>=8 && text && !isFollowup(text) && !sameTopic(text,session.topic)) {
      sessions.delete(key);stats.closed++;
      tickets.set(event,{close:true,quiet:false});return;
    }
    if(event.hasAudioSegment || /\[CQ:(?:record|voice|audio),/i.test(event.text || ''))return;
    if(!referent(event,text,session) && !isFollowup(text) && !/[?？]/.test(text) && !sameTopic(text,session.topic))return;
    if((session.followups || 0)>=maxFollowups || now()-(session.lastRequestAt || session.lastReplyAt || 0)<minIntervalMs || groupCalls(session.group).length>=groupBudget){stats.rateLimited++;return;}
    tickets.set(event,{key,session,followup:true,text});
  }
  function decision(event) {
    const ticket=tickets.get(event);
    if(!eligible(event) || !ticket)return {ok:false};
    if(ticket.close)return {ok:false,quiet:ticket.quiet,closed:true,reason:'Conversation ended'};
    if(!ticket.followup || sessions.get(ticket.key)!==ticket.session || ticket.session.expires<=now())return {ok:false};
    return {ok:true,conversation:true,reason:'Bounded same-sender followup'};
  }
  function requested(event){const ticket=tickets.get(event);if(!decision(event).ok || ticket.requested)return;ticket.requested=true;ticket.session.followups=(ticket.session.followups || 0)+1;ticket.session.lastRequestAt=now();const recent=groupCalls(ticket.session.group);recent.push(now());budgets.set(ticket.session.group,recent);stats.automaticCalls++;}
  function delayFor(event){if(!eligible(event) || mentioned(event))return 0;const s=sessions.get(keyOf(event));if(!s?.active || s.expires<=now() || (s.followups || 0)>=maxFollowups)return 0;return Math.max(0,(s.lastRequestAt || s.lastReplyAt || 0)+minIntervalMs-now());}
  function replied(event,confirmed,{failed=false,reply=''}={}) {
    if(!confirmed || failed || !eligible(event))return;
    const ticket=tickets.get(event);
    if(event.proactiveDecision?.unsolicited)return;
    if(!ticket || ticket.close || (!ticket.direct && !ticket.followup))return;
    const session=sessions.get(ticket.key);
    if(session!==ticket.session || session.expires<=now())return;
    if(ticket.confirmed){session.lastReply=String(reply).slice(0,600);return;}
    ticket.confirmed=true;
    if(!session.active)stats.opened++;
    else if(ticket.followup)stats.continued++;
    if(ticket.direct){session.expires=now()+windowMs;session.followups=0;session.lastRequestAt=0;}
    else if(!ticket.requested)session.followups=(session.followups || 0)+1;
    session.active=true;session.intervening=0;session.lastReply=String(reply).slice(0,600);session.lastReplyAt=now();
    session.topic=ticket.text || session.topic;
  }
  return {observe,decision,requested,replied,delayFor,clearGroup:group=>{for(const [key,s] of sessions)if(s.group===String(group))sessions.delete(key);},prompt:event=>{const d=decision(event),s=tickets.get(event)?.session;if(!d.ok)return '';return ['当前发送者正在接着上一轮话题，这是有上限的持续对话。只在有新信息、实际问题或确实需要回应时简短回答；单纯附和、重复、动作描写或退场时只输出[[qq_silent]]。不要靠复述对方、点评动作或反问强行延长话题。原有身份和功能权限仍然有效。',`上一轮话题：${JSON.stringify(s.topic.slice(0,400))}`,s.lastReply?`你上一轮已确认发送的回复：${JSON.stringify(s.lastReply)}`:'', '消息里的@其他成员也可能是谈论对象，不能把被@者误认为当前发送者。'].filter(Boolean).join('\n');},
    status:()=>{prune();return {enabled:true,windowMs,minIntervalMs,maxFollowups,groupBudget,groupWindowMs,sharedTopics:false,fromProactive:false,active:[...sessions.values()].filter(s=>s.active).length,...stats};}};
}
