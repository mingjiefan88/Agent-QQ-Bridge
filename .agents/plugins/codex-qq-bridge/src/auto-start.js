// Wait for human login without making a second NapCat instance or resuming a paused bot.
export function createAutoStarter({config,napcat,bot,emit=()=>{},intervalMs=10000}) {
  let wanted=false,generation=0,timer=null,lastError='';
  const current=id=>wanted && generation===id;
  function cancel(){wanted=false;generation++;clearTimeout(timer);timer=null;}
  function report(error){const text=String(error.message || error);if(text!==lastError){lastError=text;emit('bridge','info','自动启动正在等待：'+text);}}
  async function check(id){
    if(!current(id))return;
    try{
      const health=await napcat.status();
      if(current(id) && health.online){
        await bot.start({shouldEnable:()=>current(id)});
        if(current(id) && bot.status().enabled){wanted=false;lastError='';emit('bridge','complete','登录与连接已就绪，机器人已自动启动');}
      }
    }catch(error){if(current(id))report(error);}
    finally{if(current(id)){timer=setTimeout(()=>void check(id),intervalMs);timer.unref?.();}}
  }
  return {
    cancel,status:()=>({pending:wanted,lastError}),
    async start(){
      cancel();if(!config().completed)return;
      wanted=true;lastError='';const id=generation;
      emit('bridge','info','一键启动已开启；等待QQ和Codex登录，完成后自动接入');
      try{const health=await napcat.status();if(current(id) && !health.online && health.phase==='unavailable')await napcat.start();}
      catch(error){if(current(id))report(error);}
      await check(id);
    }
  };
}
