import {randomUUID} from 'node:crypto';

export function cleanTraceText(value,limit=600) {
  return String(value ?? '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'')
    .replace(/(bearer\s+)[\w.\-]+/gi,'$1[已遮蔽]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)["']?\s*[=:]\s*["']?)[^\s,;"'}]+/gi,'$1[已遮蔽]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g,'[已遮蔽]')
    .trim().slice(0,limit);
}

export function createExecutionTrace({now=Date.now}={}) {
  const state={bootId:randomUUID(),sequence:0,active:{},events:[]};
  function emit(run,kind,text) {
    const event={id:++state.sequence,at:new Date(now()).toISOString(),runId:run.id,label:run.label,kind,text:cleanTraceText(text)};
    state.events.push(event);if(state.events.length>120)state.events.shift();
    if(state.active[run.id])state.active[run.id].stage=event.text;
  }
  return {state,
    begin(label) {
      const run={id:randomUUID(),label:cleanTraceText(label,40),startedAt:now(),stage:'正在启动'};
      state.active[run.id]=run;
      emit(run,'start','开始处理请求');
      let buffer='',discard=false,done=false,threadId=null;
      const seen=new Set();
      function consume(line) {
        if(!line || line.length>262144)return;
        let event;try{event=JSON.parse(line);}catch{return;}
        if(event.type==='thread.started') {
          if(/^[a-f0-9-]{16,50}$/i.test(event.thread_id || ''))threadId=event.thread_id;
          return;
        }
        if(event.type==='turn.started'){emit(run,'progress','模型正在处理');return;}
        if(event.type==='turn.completed') {
          const count=Number(event.usage?.output_tokens);
          emit(run,'progress',`模型输出结束${Number.isFinite(count)?`，输出 ${count} tokens`:''}`);return;
        }
        if(event.type==='error' || event.type==='turn.failed') {
          emit(run,'error',event.error?.message || event.message || '模型调用报告失败');return;
        }
        if(!['item.started','item.updated','item.completed'].includes(event.type))return;
        const item=event.item || {},finished=event.type==='item.completed';
        // Consume only the CLI's public item stream; never raw analysis/content or tool arguments/results.
        if(item.channel==='analysis' || item.phase==='analysis')return;
        const key=`${event.type}:${item.id || item.type}:${item.status || ''}`;
        if(seen.has(key))return;
        if(event.type==='item.updated')return;
        seen.add(key);if(seen.size>240)seen.delete(seen.values().next().value);
        if(item.type==='reasoning' && finished) {
          const summary=Array.isArray(item.summary)?item.summary.filter(part=>part.type==='summary_text').map(part=>part.text).join('\n'):'';
          if(summary)emit(run,'summary',summary);
        } else if(item.type==='agent_message' && finished && item.text) {
          emit(run,item.phase==='commentary'?'progress':'reply',item.text);
        } else if(item.type==='mcp_tool_call') {
          const name=[item.server,item.tool].filter(Boolean).map(value=>String(value).replace(/[^A-Za-z0-9_.:/-]/g,'').slice(0,70)).join('/');
          emit(run,'tool',`${name || '工具调用'}：${finished?(item.status==='failed'?'失败':'结束'):'执行中'}`);
        } else if(item.type==='web_search') {
          emit(run,'tool',finished?'联网检索结束':'正在联网检索');
        } else if(item.type==='command_execution') {
          emit(run,'tool',finished?`终端工具结束${Number.isInteger(item.exit_code)?`，退出码 ${item.exit_code}`:''}`:'终端工具执行中');
        } else if(item.type==='file_change' && finished) {
          emit(run,'tool',`文件工具结束，涉及 ${Array.isArray(item.changes)?item.changes.length:0} 项`);
        } else if(item.type==='image_generation') {
          emit(run,'tool',finished?'生图工具结束':'生图工具处理中');
        }
      }
      return {
        get threadId(){return threadId;},
        feed(chunk) {
          if(done)return;
          buffer+=String(chunk);
          let newline;
          while((newline=buffer.indexOf('\n'))>=0) {
            const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
            if(!discard)consume(line);discard=false;
          }
          if(buffer.length>262144){buffer='';discard=true;}
        },
        finish(status,message) {
          if(done)return;
          if(buffer && !discard)consume(buffer);
          buffer='';done=true;
          const elapsed=Math.max(0,now()-run.startedAt);
          emit(run,status==='completed'?'complete':'error',message || (status==='completed'?`任务完成，用时 ${(elapsed/1000).toFixed(1)} 秒`:`任务${status==='timeout'?'超时':'失败'}`));
          delete state.active[run.id];
        }
      };
    }
  };
}
