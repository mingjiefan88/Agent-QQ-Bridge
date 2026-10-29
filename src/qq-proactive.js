export function topicInterest(text) {
  const topic = /AI|GPT|模型|编程|代码|软件|电脑|设计|配色|排版|字体|绘画|画风|插画|游戏|角色|龙娘|动漫|电影|音乐|bug/i.test(text);
  const conversational = /怎么|为什么|有没有|觉得|好看|好玩|难受|纠结|离谱|笑死|有意思|太难|厉害|好奇|[？?]/.test(text);
  return (topic ? 2 : 0) + (conversational ? 1 : 0) + (text.length >= 20 ? 1 : 0);
}

function groupState(qq, groupId) {
  const proactive = qq.proactive;
  proactive.lastProactiveReplyAt ||= {};
  proactive.lastAttemptAt ||= {};
  proactive.inFlight ||= {};
  proactive.groups ||= {};
  return proactive.groups[groupId] ||= {candidates:0,misses:0,selected:0,sent:0,silent:0,errors:0};
}

export function decideProactiveReply(event, qq, context = {}) {
  const no = reason => ({ok:false,reason});
  if (!qq.proactive?.enabled) return no('Proactive replies are off');
  if (event.type !== 'group_message' || !event.groupId) return no('Not an ordinary group message');
  if (!qq.allowedGroups.includes(event.groupId)) return no('Group is not allowed');
  if (qq.bannedUserIds?.includes(String(event.senderId))) return no('Sender is banned');
  if (event.selfId && String(event.senderId) === String(event.selfId)) return no('Self message ignored');
  const stats = groupState(qq, event.groupId);
  const now = context.now ?? Date.now();
  const skip = reason => { stats.lastReason = reason; return no(reason); };
  if (event.hasAtSegment || event.hasReplySegment) return skip('Conversation addressed to another member');
  if (event.hasAudioSegment || /\[CQ:(?:markdown|record|voice|audio),/i.test(event.text || '')) return skip('Audio or bot card skipped');
  const text = String(context.stripMentionText ? context.stripMentionText(event.text) : event.text || '').replace(/\[CQ:[^\]]*\]/g,'').trim();
  const meaningful = text.replace(/[^\p{L}\p{N}]/gu,'');
  if (meaningful.length < (context.memberInterjection ? 1 : 3) || text.length > 600 || /^(?:哈+|呵+|嘿+|啊+|哦+|嗯+|[6]+|[8]+)$/.test(meaningful)
    || /^[/＠@]/.test(text) || /https?:\/\//i.test(text)) return skip('Not a conversational text candidate');
  if (context.isImageRequest?.(text) || context.isImageStatusRequest?.(text) || context.isFilesystemProbe?.(text)
    || /密码|密钥|验证码|转账|银行卡|身份证|关闭QQ|停止QQ|关机|删除文件|读取文件/i.test(text)) return skip('Commands and private operations require a direct request');
  if (context.busy) return skip('Image worker busy; proactive reply deferred');
  if (event.raw?.time && now - Number(event.raw.time) * 1000 > 120000) return skip('Stale group message skipped');
  if (qq.proactive.inFlight[event.groupId]) return skip('Proactive reply already in progress');
  const last = Number(qq.proactive.lastProactiveReplyAt[event.groupId] || 0);
  const interval = Math.max(300000, Number(qq.proactive.minIntervalMs) || 300000);
  if (last && now - last < interval) return skip('Proactive cooldown (at least 5 minutes)');
  const lastReply = Number(qq.proactive.lastGroupReplyAt?.[event.groupId] || 0);
  if (lastReply && now - lastReply < 30000) return skip('Brief pause after a direct reply (30 seconds)');
  const lastAttempt = Number(qq.proactive.lastAttemptAt[event.groupId] || 0);
  if (lastAttempt && now - lastAttempt < 60000) return skip('Quiet/error retry backoff (60 seconds)');
  // Let the model judge ordinary conversation using its existing recent-group context.
  // A bounded miss count prevents a small group from losing every independent lottery.
  if(context.social?.suppressReason)return skip(context.social.suppressReason);
  stats.candidates++;
  if(context.memberInterjection?.interjection) {
    const chance=Math.min(0.35,Math.max(0,Number(context.memberInterjection.chance) || 0));
    if((context.random || Math.random)()>=chance)return skip('Member interjection chance skipped');
    stats.misses=0;stats.lastReason='Configured member interjection selected';
    return {ok:true,proactive:true,unsolicited:true,replyText:String(context.memberInterjection.interjection),reason:stats.lastReason};
  }
  const chance = Math.min(0.45,(topicInterest(text) >= 2 ? 0.35 : 0.25)*(context.social?.chanceMultiplier ?? 1));
  if (stats.misses < 2 && (context.random || Math.random)() >= chance) {
    stats.misses++;
    return skip('Low-frequency chance skipped; next candidate gets another chance');
  }
  stats.misses = 0;
  stats.lastReason = 'Conversation selected for a low-frequency interjection';
  return {ok:true,proactive:true,unsolicited:true,includeRecentContext:true,reason:stats.lastReason};
}

export function reserveProactiveReply(event, qq, now = Date.now()) {
  const stats = groupState(qq, event.groupId);
  event.proactiveReservedAt = now;
  event.proactivePreviousReplyAt = qq.proactive.lastGroupReplyAt?.[event.groupId] || 0;
  qq.proactive.inFlight[event.groupId] = now;
  qq.proactive.lastAttemptAt[event.groupId] = now;
  stats.selected++;
  stats.lastSelectedAt = now;
}

export function finishProactiveReply(event, qq, {sent = false, error = null, now = Date.now()} = {}) {
  if (!event.proactiveDecision?.unsolicited) return;
  const stats = groupState(qq, event.groupId);
  if (qq.proactive.inFlight[event.groupId] !== event.proactiveReservedAt) return;
  delete qq.proactive.inFlight[event.groupId];
  qq.proactive.lastAttemptAt[event.groupId] = now;
  if (sent) {
    qq.proactive.lastProactiveReplyAt[event.groupId] = now;
    stats.sent++;
    stats.lastOutcome = 'sent';
  } else {
    stats[error ? 'errors' : 'silent']++;
    stats.lastOutcome = error ? 'error' : 'silent';
  }
  stats.lastOutcomeAt = now;
}
