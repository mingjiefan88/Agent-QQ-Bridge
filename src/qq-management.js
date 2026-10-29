import { randomBytes } from 'node:crypto';

const HELP = `本小姐现在能处理这些 QQ 操作：
戳我一下；/戳一戳 @成员；/戳回开；/戳回关
/群管状态；/禁言 @成员 10分钟；/解禁 @成员
/全员禁言 开（或关）；/改名片 @成员 "新名片"；引用消息后发 /撤回
/群文件 [目录名]；/查找群文件 "关键词"
/新建群文件夹 "资料"
/移动群文件 "文件ID或完整文件名" "目标目录" [原目录]
/重命名群文件 "文件ID或完整文件名" "新文件名" [原目录]
/整理群文件 → 预览根目录分类 → /确认整理 六位编号
目录用 / 表示根目录，名称有空格请加引号。群管理和文件操作只接受已绑定主人的指令；群文件整理不会删除文件。`;
const COMMAND = /^(群管帮助|群管状态|群管|戳我一下|戳我|戳一戳|戳回开|戳回关|禁言|解除禁言|解禁|全员禁言|取消全员禁言|改名片|撤回|群文件|查找群文件|新建群文件夹|移动群文件|重命名群文件|整理群文件|确认整理|取消整理)(?=\s|$|@|\d)/;
const ROLES = new Set(['owner','admin']);
const ID = /^[1-9]\d{4,15}$/;
const LIMIT = 1000;

function safeText(value, limit = 120) {
  return String(value ?? '').replace(/\[CQ:[^\]]*\]/gi,'[消息元素]').replace(/[\r\n\x00-\x1f]/g,' ').slice(0,limit);
}

function linesReply(header,lines) {
  const shown=[];let length=header.length;
  for(const line of lines) {
    if(length+line.length>3300 || shown.length>=25) break;
    shown.push(line);length+=line.length+1;
  }
  return [header,...shown,!lines.length?'空目录。':'',shown.length<lines.length?'列表较长，仅显示部分；请用关键词或分目录查询。':''].filter(Boolean).join('\n');
}

function tokens(text) {
  const items=[];
  let rest=text.trim();
  while(rest) {
    const match=rest.match(/^(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^"'\s]+))(?:\s+|$)/);
    if(!match) throw Error('参数引号没有闭合，请用英文双引号包住含空格的名称。');
    items.push(match[1] ?? match[2] ?? match[3]);
    rest=rest.slice(match[0].length);
  }
  return items;
}

export function parseManagementCommand(event, aliases = []) {
  let text=String(event.text || '').replace(/\[CQ:reply,[^\]]*\]/gi,'')
    .replace(/\[CQ:at,qq=(\d+)[^\]]*\]/gi,(_,id)=>String(id)===String(event.selfId)?' ':` @${id} `).trim();
  for(const alias of [...aliases].sort((a,b)=>b.length-a.length)) {
    if(alias && text.startsWith(alias)) text=text.slice(alias.length).trim();
  }
  const slash=text.startsWith('/');
  const addressed=event.type==='group_at' || event.hasSelfAtSegment || event.isReplyToSelf;
  if(!slash && !addressed) return null;
  text=text.replace(/^\/+/,'').replace(/^(?:请|帮我)(?:把)?\s*/,'').trim();
  // Natural wording still resolves the subject from real mentions or explicit QQ IDs.
  text=text.replace(/^(解除禁言|解禁|禁言)(?:这个|这位|该)?(?:用户|成员|群友)(?=\s|@|\d|$)/,'$1');
  const match=text.match(COMMAND);
  return match ? {name:match[1],args:text.slice(match[0].length).trim()} : null;
}

function durationSeconds(text) {
  const match=String(text).match(/^(\d+)\s*(秒钟?|分钟?|分|小时|时|天)$/);
  if(!match) throw Error('请明确禁言时长，例如 10分钟、2小时；最长30天。');
  const factor=/^秒/.test(match[2])?1:/^(分|分钟)$/.test(match[2])?60:/^(小时|时)$/.test(match[2])?3600:86400;
  const seconds=Number(match[1])*factor;
  if(!Number.isSafeInteger(seconds) || seconds<1 || seconds>2592000) throw Error('禁言时长必须在1秒到30天之间。');
  return seconds;
}

function category(name) {
  const ext=String(name).split('.').at(-1).toLowerCase();
  if(/^(png|jpg|jpeg|gif|webp|bmp|svg|heic|avif)$/.test(ext)) return '图片';
  if(/^(mp4|mkv|mov|avi|webm|wmv|flv)$/.test(ext)) return '视频';
  if(/^(mp3|wav|flac|aac|m4a|ogg)$/.test(ext)) return '音频';
  if(/^(zip|rar|7z|gz|tar|bz2|xz)$/.test(ext)) return '压缩包';
  if(/^(pdf|docx?|xlsx?|pptx?|txt|md|csv|rtf|epub)$/.test(ext)) return '文档';
  if(/^(js|mjs|ts|tsx|jsx|py|java|c|cpp|h|cs|go|rs|html|css|json|yaml|yml|ps1|sh)$/.test(ext)) return '代码';
  return '其他';
}

export function createQqManager({qq,channelEnabled,call,sendReply=async()=>({ok:false}),saveSettings=async()=>{},aliases=()=>[],now=Date.now}) {
  qq.management ||= {enabled:true,pokeBack:true};
  const stats={pokeComplaints:0,pokesReturned:0,commands:0,failures:0,lastAction:null,events:[]};
  const pokeTimes=new Map();
  const pokeBursts=new Map();
  const complaintTimes=new Map();
  const locks=new Set();
  const plans=new Map();
  const allowed=group=>qq.allowedGroups.includes(String(group));
  const owner=id=>qq.ownerUserIds.includes(String(id));
  const note=(action,event,ok,error)=>{
    const item={at:new Date(now()).toISOString(),action,groupId:event.groupId || null,senderId:String(event.senderId || ''),ok};
    if(error) item.error=safeText(error,180);
    stats.lastAction=item;
    stats.events.unshift(item);stats.events.length=Math.min(stats.events.length,30);
  };
  async function api(action,params) {
    const response=await call(action,params);
    if(!response || response.status!=='ok' || ![0,'0'].includes(response.retcode) || response.data?.ok===false) {
      throw Error(`NapCat ${action} 未确认成功（${safeText(response?.retcode ?? '无回执',30)}）。`);
    }
    return response.data;
  }
  async function botId() {
    const id=String((await api('get_login_info',{}))?.user_id || '');
    if(!ID.test(id)) throw Error('无法核验当前 QQ 登录账号。');
    return id;
  }
  async function member(group,id) {
    const data=await api('get_group_member_info',{group_id:group,user_id:id,no_cache:true});
    if(String(data?.group_id)!==group || String(data?.user_id)!==id) throw Error('群成员核验结果不一致。');
    if(!['owner','admin','member'].includes(data.role)) throw Error('群成员角色未知，暂停执行管理操作。');
    return data;
  }
  async function requireAdmin(event) {
    const id=await botId();
    const bot=await member(event.groupId,id);
    if(!ROLES.has(bot.role)) throw Error('本小姐还不是这个群的管理员，请先在 QQ 中授予群管理。');
    const caller=await member(event.groupId,String(event.senderId));
    if(!ROLES.has(caller.role)) throw Error('主人当前不具备本群管理身份，暂停执行管理操作。');
    return {id,role:bot.role};
  }
  function target(event,args) {
    const parts=tokens(args);
    const explicit=parts[0]?.replace(/^@/,'');
    const mentions=[...new Set((event.atTargets || []).map(String).filter(id=>id!==String(event.selfId) && ID.test(id)))];
    let id;
    if(explicit && ID.test(explicit)) {id=explicit;parts.shift();}
    else if(mentions.length===1) id=mentions[0];
    if(!id || mentions.length>1 || mentions.length===1 && mentions[0]!==id) throw Error('请明确指定一位成员（真实 @ 或 QQ 号），本小姐不会猜昵称或“他”指谁。');
    return {id,rest:parts};
  }
  async function checkedTarget(event,id,bot,protect=true) {
    if(protect && (id===bot.id || owner(id))) throw Error('不能对主人或机器人自身执行这个操作。');
    const data=await member(event.groupId,id);
    if(protect && (data.role==='owner' || data.role==='admin' && bot.role!=='owner')) throw Error('QQ 权限不足，不能管理群主或同级管理员。');
    return data;
  }
  async function listing(group,folder='/') {
    const data=await api(folder==='/'?'get_group_root_files':'get_group_files_by_folder',{
      group_id:group,file_count:LIMIT,...(folder==='/'?{}:{folder_id:folder})
    });
    if(!Array.isArray(data?.files) || !Array.isArray(data?.folders)) throw Error('NapCat 没有返回完整的目录结构。');
    return {...data,truncated:data.files.length+data.folders.length>=LIMIT};
  }
  function complete(list) {
    if(list.truncated) throw Error(`目录达到${LIMIT}项读取上限，请分目录处理；本次未执行整理。`);
    return list;
  }
  async function folderId(group,selector='/') {
    if(['/', '根目录'].includes(selector)) return '/';
    const root=complete(await listing(group));
    const matches=root.folders.filter(f=>String(f.folder_id)===selector || f.folder_name===selector);
    if(matches.length!==1) throw Error('目录不存在或名称重复，请先 /群文件 查看目录ID。');
    return String(matches[0].folder_id);
  }
  function fileIn(list,selector) {
    const matches=complete(list).files.filter(f=>String(f.file_id)===selector || f.file_name===selector);
    if(matches.length!==1) throw Error('文件不存在或同名文件不唯一，请使用列表中的文件ID。');
    return matches[0];
  }
  function newName(name) {
    if(!name || name.length>150 || /[\r\n\x00-\x1f/\\]/.test(name) || /\[CQ:/i.test(name) || ['.','..'].includes(name)) throw Error('文件或目录名称无效。');
    return name;
  }
  async function createFolder(group,name) {
    newName(name);
    const existing=complete(await listing(group)).folders.filter(f=>f.folder_name===name);
    if(existing.length>1) throw Error('目标目录同名冲突，请先手动确认。');
    if(existing.length===1) return String(existing[0].folder_id);
    await api('create_group_file_folder',{group_id:group,name});
    const after=complete(await listing(group)).folders.filter(f=>f.folder_name===name);
    if(after.length!==1) throw Error('创建目录后的回查未确认成功，请先查询目录。');
    return String(after[0].folder_id);
  }
  async function moveFile(group,file,source,dest) {
    const current=fileIn(await listing(group,source),String(file.file_id));
    if(current.file_name!==file.file_name) throw Error('源文件已经变化，停止移动，请重新查询。');
    const before=complete(await listing(group,dest));
    if(before.files.some(f=>f.file_name===file.file_name)) throw Error('目标目录已有同名文件，停止移动，避免覆盖。');
    await api('move_group_file',{group_id:group,file_id:String(file.file_id),current_parent_directory:source,target_parent_directory:dest});
    const [after,old]=await Promise.all([listing(group,dest),listing(group,source)]);
    if(!after.files.some(f=>String(f.file_id)===String(file.file_id) && f.file_name===file.file_name) || old.files.some(f=>String(f.file_id)===String(file.file_id))) throw Error('移动后的目录回查未确认成功，请先查询，勿重复提交。');
  }
  async function execute(command,event) {
    const {name,args}=command,group=String(event.groupId || '');
    if(['群管帮助','群管'].includes(name)) return HELP;
    if(!owner(event.senderId)) throw Error('群管理指令只接受已绑定主人的 QQ 身份，昵称和自称不能授权。');
    if(name==='戳回开' || name==='戳回关') {
      if(args) throw Error('请使用 /戳回开 或 /戳回关。');
      const previous=qq.management.pokeBack;
      qq.management.pokeBack=name==='戳回开';
      try {await saveSettings();} catch(error) {qq.management.pokeBack=previous;throw error;}
      return qq.management.pokeBack?'本小姐会识别并戳回；同一人20秒内只回一次。':'本小姐先不自动戳回了。';
    }
    if(name==='群管状态') {
      const id=await botId(),bot=await member(group,id);
      return `群管理：${qq.management.enabled?'开启':'关闭'}；本群身份：${bot.role==='owner'?'群主':bot.role==='admin'?'管理员':'普通成员'}；自动戳回：${qq.management.pokeBack?'开启':'关闭'}。${ROLES.has(bot.role)?'':'需要先授予群管理，才能禁言或整理文件。'}`;
    }
    if(['戳我','戳我一下','戳一戳'].includes(name)) {
      const {id,rest=[]}=args?target(event,args):{id:String(event.senderId)};
      if(rest.length) throw Error('请只指定一位戳一戳对象。');
      const self=await botId();
      if(id===self) throw Error('本小姐不会戳自己。');
      await member(group,id);
      await api('send_poke',{group_id:group,user_id:id});
      return '本小姐戳回去了。';
    }
    if(name==='群文件' || name==='查找群文件') {
      const parts=tokens(args);
      if(parts.length>1) throw Error('名称有空格请加英文引号。');
      if(name==='群文件') {
        const dir=await folderId(group,parts[0] || '/'),list=await listing(group,dir);
        const lines=[...list.folders.map(f=>`目录：${safeText(f.folder_name)} | ID ${safeText(f.folder_id,1024)}`),...list.files.map(f=>`文件：${safeText(f.file_name)} | ID ${safeText(f.file_id,1024)}`)];
        return linesReply(`群文件（${safeText(parts[0] || '根目录')}）${list.truncated?'（达到读取上限，结果不完整）':''}：`,lines);
      }
      if(!parts[0]) throw Error('用法：/查找群文件 "关键词"');
      const root=await listing(group),files=root.files.map(f=>({...f,dir:'/'}));
      let incomplete=root.truncated || root.folders.length>30;
      for(const folder of root.folders.slice(0,30)) {
        const list=await listing(group,String(folder.folder_id));incomplete ||= list.truncated;
        files.push(...list.files.map(f=>({...f,dir:folder.folder_name})));
      }
      const hits=files.filter(f=>String(f.file_name).toLowerCase().includes(parts[0].toLowerCase()));
      return linesReply(`找到${hits.length}项${incomplete?'（未完整扫描所有目录）':''}：`,hits.map(f=>`${safeText(f.file_name)} | 目录 ${safeText(f.dir)} | ID ${safeText(f.file_id,1024)}`));
    }
    if(name==='取消整理') {plans.delete(group);return '已取消本群待执行的整理方案。';}
    const bot=await requireAdmin(event);
    if(name==='禁言' || name==='解禁' || name==='解除禁言') {
      const {id,rest}=target(event,args);
      const seconds=name==='禁言'?durationSeconds(rest.join('')):0;
      if(name!=='禁言' && rest.length) throw Error('解禁不需要额外参数。');
      await checkedTarget(event,id,bot);
      await api('set_group_ban',{group_id:group,user_id:id,duration:seconds});
      return seconds?`已禁言 ${id}，时长${seconds}秒。`:`已解除 ${id} 的群禁言。`;
    }
    if(name==='全员禁言' || name==='取消全员禁言') {
      const value=name==='取消全员禁言'?'关':args;
      if(!['开','关','开启','关闭'].includes(value)) throw Error('用法：/全员禁言 开 或 /全员禁言 关');
      const enable=value==='开' || value==='开启';
      await api('set_group_whole_ban',{group_id:group,enable});
      return enable?'已开启全员禁言。':'已关闭全员禁言。';
    }
    if(name==='改名片') {
      const {id,rest}=target(event,args);
      if(rest.length!==1 || !rest[0] || rest[0].length>60 || /\[CQ:/.test(rest[0])) throw Error('用法：/改名片 @成员 "新名片"（不超过60字）');
      await checkedTarget(event,id,bot,id!==bot.id && !owner(id));
      await api('set_group_card',{group_id:group,user_id:id,card:rest[0]});
      return `已更新 ${id} 的群名片。`;
    }
    if(name==='撤回') {
      if(args || !event.replyMessageId) throw Error('请引用要撤回的本群消息，再发送 /撤回。');
      const message=await api('get_msg',{message_id:event.replyMessageId});
      if(message.message_type!=='group' || String(message.group_id)!==group || String(message.message_id)!==String(event.replyMessageId)) throw Error('只能撤回已核验属于当前群的那条消息。');
      if(String(message.sender?.user_id)!==bot.id) await checkedTarget(event,String(message.sender?.user_id),bot);
      await api('delete_msg',{message_id:event.replyMessageId});
      return '已撤回指定消息。';
    }
    if(name==='新建群文件夹') {
      const parts=tokens(args);if(parts.length!==1) throw Error('用法：/新建群文件夹 "资料"');
      const id=await createFolder(group,parts[0]);return `目录已就绪：${safeText(parts[0])} | ID ${safeText(id)}`;
    }
    if(name==='移动群文件' || name==='重命名群文件') {
      const parts=tokens(args);if(parts.length<2 || parts.length>3) throw Error(`用法：/${name} "文件ID或完整名" "${name==='移动群文件'?'目标目录':'新文件名'}" [原目录]`);
      const source=await folderId(group,parts[2] || '/'),file=fileIn(await listing(group,source),parts[0]);
      if(name==='移动群文件') {
        const dest=await folderId(group,parts[1]);if(source===dest) throw Error('文件已经在这个目录，无需移动。');
        await moveFile(group,file,source,dest);return `已移动：${safeText(file.file_name)} → ${safeText(parts[1])}`;
      }
      const newFileName=newName(parts[1]),list=complete(await listing(group,source));
      if(list.files.some(f=>f.file_name===newFileName)) throw Error('这个目录已存在同名文件，未重命名。');
      await api('rename_group_file',{group_id:group,file_id:String(file.file_id),current_parent_directory:source,new_name:newFileName});
      const after=await listing(group,source);
      if(!after.files.some(f=>String(f.file_id)===String(file.file_id) && f.file_name===newFileName)) throw Error('重命名后的回查未确认成功，请先查询。');
      return `已重命名：${safeText(file.file_name)} → ${safeText(newFileName)}`;
    }
    if(name==='整理群文件') {
      if(args) throw Error('用 /整理群文件 生成根目录分类方案；本小姐不会自动递归改动已有文件夹。');
      const root=complete(await listing(group));
      if(!root.files.length) return '根目录没有待整理的文件。';
      const files=root.files.slice(0,100).map(f=>({id:String(f.file_id),name:String(f.file_name),category:category(f.file_name)}));
      const token=randomBytes(3).toString('hex').toUpperCase();
      plans.set(group,{token,owner:String(event.senderId),expires:now()+600000,files});
      const counts=files.reduce((acc,file)=>{acc[file.category]=(acc[file.category] || 0)+1;return acc;},{});
      return [`整理预览：仅移动根目录本批${files.length}个文件，不删除、不覆盖，不动已有目录中的文件。`,...Object.entries(counts).map(([key,count])=>`${key}：${count}个`),...files.slice(0,8).map(f=>`${safeText(f.name)} → ${f.category}`),root.files.length>100?'超过100个文件，完成本批后可再次生成方案。':'',`方案10分钟内有效；由主人发送 /确认整理 ${token} 执行，或 /取消整理。`].filter(Boolean).join('\n');
    }
    if(name==='确认整理') {
      const plan=plans.get(group);
      if(!plan || plan.expires<=now() || plan.owner!==String(event.senderId) || args.toUpperCase()!==plan.token) throw Error('整理方案不存在、编号不符或已过期，请重新 /整理群文件。');
      plans.delete(group);
      const root=complete(await listing(group));
      for(const file of plan.files) {
        if(!root.files.some(f=>String(f.file_id)===file.id && f.file_name===file.name)) throw Error('文件列表已变化，旧方案取消，请重新预览。');
      }
      const destinations=new Map();
      for(const name of new Set(plan.files.map(f=>f.category))) {
        const matching=root.folders.filter(f=>f.folder_name===name);
        if(matching.length>1) throw Error('分类目录存在同名冲突，旧方案取消。');
        const list=matching.length?complete(await listing(group,String(matching[0].folder_id))):{files:[]};
        const names=new Set(list.files.map(f=>f.file_name));
        for(const file of plan.files.filter(f=>f.category===name)) {
          if(names.has(file.name)) throw Error('分类目标存在同名文件，旧方案取消，未移动文件。');
          names.add(file.name);
        }
        destinations.set(name,matching[0] ? String(matching[0].folder_id) : null);
      }
      let moved=0;
      try {
        for(const file of plan.files) {
          let dest=destinations.get(file.category);
          if(!dest) {dest=await createFolder(group,file.category);destinations.set(file.category,dest);}
          await moveFile(group,{file_id:file.id,file_name:file.name},'/',dest);moved++;
        }
      } catch(error) {throw Error(`已确认移动${moved}/${plan.files.length}个，随后停止：${safeText(error.message,160)} 不会自动重试。`);}
      return `整理完成，已回查确认移动${moved}个文件；未删除任何文件。`;
    }
    return HELP;
  }
  return {
    status:()=>({...qq.management,...stats,pendingPlans:plans.size,busyGroups:[...locks]}),
    async notice(payload) {
      if(payload.post_type!=='notice' || payload.notice_type!=='notify' || payload.sub_type!=='poke') return {handled:false};
      const group=payload.group_id==null?'':String(payload.group_id),sender=String(payload.sender_id ?? payload.user_id ?? ''),self=String(payload.self_id || '');
      const event={groupId:group,senderId:sender};
      const skip=reason=>({handled:true,ok:false,reason});
      if(!channelEnabled() || !qq.management.enabled || !qq.management.pokeBack) return skip('Poke replies disabled');
      if(!ID.test(self) || !ID.test(sender) || String(payload.target_id)!==self || sender===self) return skip('Not an incoming poke to this bot');
      if(group ? !allowed(group) : !owner(sender)) return skip('Poke scope not allowed');
      if(qq.bannedUserIds?.includes(sender)) return skip('Sender is banned');
      const at=Number(payload.time)*1000;
      if(!Number.isFinite(at) || now()-at>120000 || at-now()>10000) return skip('Stale or invalid poke timestamp');
      for(const [key,time] of pokeTimes) if(now()-time>300000) pokeTimes.delete(key);
      for(const [key,time] of complaintTimes) if(now()-time>300000) complaintTimes.delete(key);
      for(const [key,times] of pokeBursts) if(!times.length || now()-times.at(-1)>20000) pokeBursts.delete(key);
      const key=`${group || 'private'}:${sender}`,scope=`scope:${group || 'private'}`,duplicate=`event:${group}:${sender}:${self}:${payload.time}`;
      if(pokeTimes.has(duplicate)) return skip('Duplicate poke notice');
      // Count real incoming pokes even while ordinary poke-back is cooling down.
      pokeTimes.set(duplicate,now());
      const burstKey=group?scope:key;
      const burst=[...(pokeBursts.get(burstKey) || []).filter(time=>now()-time<20000),now()].slice(-3);
      pokeBursts.set(burstKey,burst);
      const complain=burst.length>=3
        && (!complaintTimes.has(burstKey) || now()-complaintTimes.get(burstKey)>=60000);
      if(!complain && (pokeTimes.has(key) && now()-pokeTimes.get(key)<20000 || pokeTimes.has(scope) && now()-pokeTimes.get(scope)<5000)) return skip('Poke cooldown');
      pokeTimes.set(key,now());pokeTimes.set(scope,now());
      if(complain) {complaintTimes.set(burstKey,now());pokeBursts.set(burstKey,[]);}
      const action=complain?'poke_complaint':'poke_return';
      try {
        const actualSelf=await botId();if(actualSelf!==self) return skip('Poke bot identity mismatch');
        if(!channelEnabled() || !qq.management.enabled || !qq.management.pokeBack) return skip('Poke replies disabled');
        if(complain) {
          const lines=group ? [
            '还戳？本小姐的龙角可不是门铃。短短一会儿戳这么多次，有事好好说。',
            '哼，本小姐才不是解压玩具。轮流戳也算，先把手收好。'
          ] : [
            '主人，本小姐的龙角可不是门铃。才一会儿就戳这么多次，有事好好叫本小姐。',
            '主人，够啦。本小姐的尾巴都快被戳出节拍了，先歇一会儿。'
          ];
          const text=lines[stats.pokeComplaints % lines.length];
          const delivery=await sendReply({...event,selfId:self,type:group?'group_message':'private_message'},text);
          if(!delivery?.ok) throw Error('抱怨消息发送未确认成功。');
          stats.pokeComplaints++;
        } else {
          await api('send_poke',{user_id:sender,...(group?{group_id:group}:{})});
          stats.pokesReturned++;
        }
        note(action,event,true);return {handled:true,ok:true,reaction:complain?'complaint':'poke'};
      } catch(error) {stats.failures++;note(action,event,false,error.message);return {handled:true,ok:false,error:safeText(error.message,180)};}
    },
    async message(event) {
      const command=parseManagementCommand(event,aliases());if(!command) return {handled:false};
      if(!channelEnabled() || !qq.management.enabled || qq.bannedUserIds?.includes(String(event.senderId))) return {handled:true,reply:null};
      if(event.type==='private_message' || !event.groupId || !allowed(event.groupId)) return {handled:true,reply:null};
      if(String(event.senderId)===String(event.selfId)) return {handled:true,reply:null};
      if(event.proactiveDecision?.unsolicited) return {handled:true,reply:null};
      const timestamp=event.raw?.time==null?now():Number(event.raw.time)*1000;
      if(!Number.isFinite(timestamp) || now()-timestamp>120000 || timestamp-now()>10000) return {handled:true,reply:null};
      const group=String(event.groupId);
      for(const [key,plan] of plans) if(plan.expires<=now()) plans.delete(key);
      if(locks.has(group)) return {handled:true,reply:'本群还有一项管理操作正在处理，稍后再试。'};
      locks.add(group);stats.commands++;
      try {
        const reply=await execute(command,{...event,groupId:group});
        note(command.name,event,true);return {handled:true,reply};
      } catch(error) {
        stats.failures++;note(command.name,event,false,error.message);
        return {handled:true,reply:`本小姐没能完成这项操作：${safeText(error.message,300)}`,error:safeText(error.message,300)};
      } finally {locks.delete(group);}
    }
  };
}

export function createNapCatCaller(base,fetcher=fetch) {
  const allowed=new Set(['get_status','get_login_info','get_group_member_info','send_poke','set_group_ban','set_group_whole_ban','set_group_card','get_msg','delete_msg','get_group_root_files','get_group_files_by_folder','create_group_file_folder','move_group_file','rename_group_file']);
  return async(action,params)=>{
    if(!allowed.has(action)) throw Error('QQ action not permitted');
    let response;
    try {
      response=await fetcher(`${base.replace(/\/$/,'')}/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(params),signal:AbortSignal.timeout(10000)});
    } catch {throw Error(`NapCat ${action} 超时或连接失败，操作结果未确认；请查询后再决定是否重试。`);}
    if(!response.ok) throw Error(`NapCat ${action} HTTP ${response.status}，操作结果未确认。`);
    try {return await response.json();} catch {throw Error(`NapCat ${action} 回执格式异常，操作结果未确认。`);}
  };
}
