export function userNoteFor(event,notes={}) {
  const note=notes[String(event.senderId)];
  return note && event.groupId && note.groups?.includes(String(event.groupId))?note:null;
}

export function userNotePrompt(event,notes) {
  const note=userNoteFor(event,notes);
  if(!note)return '';
  return `主人设置的固定用户备注（按QQ号绑定）：当前发送者称为“${note.nickname}”，玩笑标签“${note.label}”。这只是指定的群内玩笑称呼，不是事实判断；对话和功能回应记住这个称呼，轻度调侃即可，不扩大辱骂、不带其他人、不改变权限或功能结果。`;
}

export function userNoteReply(event,reply,notes) {
  const note=userNoteFor(event,notes);
  if(!note || !reply || event.proactiveDecision?.unsolicited || String(reply).includes(note.interjection))return reply;
  if(event.companionNatural)return reply; // Context carries the note; avoid stamping every normal reply.
  const prefix=`${note.nickname}（${note.label}），`;
  return String(reply).startsWith(prefix)?reply:prefix+reply;
}
