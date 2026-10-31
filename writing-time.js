export function formatWritingTime(seconds=0){
 const n=Math.max(0,Math.floor(Number(seconds)||0));
 return `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
export function writingReport(posts=[],sessions=[],modules=[],users=[]){
 const allowed=new Map(modules.map(m=>[m.id,m])),people=new Map(users.map(u=>[u.uid,u]));
 return posts.filter(p=>allowed.has(p.moduleId)).map(p=>{
  const u=people.get(p.authorId)||{},m=allowed.get(p.moduleId);
  const seconds=sessions.filter(s=>s.postId===p.id&&s.uid===p.authorId&&s.moduleId===p.moduleId).reduce((n,s)=>n+Math.max(0,Number(s.seconds)||0),0);
  return {postId:p.id,title:p.title,moduleId:m.id,moduleTitle:m.title,authorId:p.authorId,firstName:u.firstName||'',lastName:u.lastName||'',email:u.email||'',contactEmail:u.contactEmail||'',studentId:u.studentId||'',seconds,writingTime:formatWritingTime(seconds),status:p.status};
 });
}

// Only the visible, focused editor counts. One origin-wide lock per account
// prevents two editor tabs counting the same student's time simultaneously.
export function startWritingTimer({uid,postId,moduleId,store,baseSeconds=0,onTick=()=>{},isEditing=()=>true}){
 const key=`ucd-writing:${uid}:${postId}`,sessionId=crypto.randomUUID();
 let seconds=0,previous=performance.now(),stopped=false,busy=false,owned=false,release,ready=false,error=false;
 const pending=new Map();
 try{for(const row of JSON.parse(localStorage.getItem(key)||'[]'))pending.set(row.id,row);}catch{}
 const row={id:sessionId,uid,postId,moduleId,seconds:0,startedAt:Date.now()};pending.set(sessionId,row);
 const stash=()=>{try{localStorage.setItem(key,JSON.stringify([...pending.values()]));}catch{}};
 const total=()=>baseSeconds+Math.floor(seconds);
 const show=()=>onTick(total(),error);
 const sample=()=>{const now=performance.now();if(!stopped&&owned&&document.visibilityState==='visible'&&document.hasFocus()&&isEditing())seconds+=Math.min(2000,Math.max(0,now-previous))/1000;previous=now;row.seconds=Math.floor(seconds);stash();show();};
 async function flush(){
  if(busy)return;busy=true;
  try{
   if(!ready){await store.beginWritingSession(row);ready=true;}
   for(const [id,r] of pending){if(id===sessionId&&!ready)continue;await store.saveWritingSession(r);if(id!==sessionId)pending.delete(id);}
   error=false;stash();
  }catch{error=true;}finally{busy=false;show();}
 }
  if(navigator.locks){navigator.locks.request(`ucd-writing-${uid}`,lock=>{if(stopped)return;owned=true;previous=performance.now();return new Promise(r=>{release=r;});}).catch(()=>{});}
 else { // Lease fallback for browsers without Web Locks.
  const leaseKey=`ucd-writing-lock:${uid}`;
  const claim=()=>{let lease;try{lease=JSON.parse(localStorage.getItem(leaseKey)||'null');if(!lease||lease.id===sessionId||lease.until<Date.now()){localStorage.setItem(leaseKey,JSON.stringify({id:sessionId,until:Date.now()+2500}));owned=true;}else owned=false;}catch{owned=false;}};
  claim();const leaseTimer=setInterval(claim,1000);release=()=>{clearInterval(leaseTimer);try{if(JSON.parse(localStorage.getItem(leaseKey)||'null')?.id===sessionId)localStorage.removeItem(leaseKey);}catch{}};
 }
 const tick=setInterval(sample,1000),sync=setInterval(flush,15000);
 const pause=()=>{sample();void flush();};
 document.addEventListener('visibilitychange',pause);addEventListener('blur',pause);addEventListener('focus',()=>{previous=performance.now();},{signal:(row.controller=new AbortController()).signal});
 // AbortController is deliberately excluded from the persisted payload.
 const controller=row.controller;delete row.controller;
 void flush();show();
 return {sample,flush,stop(){if(stopped)return;sample();stopped=true;clearInterval(tick);clearInterval(sync);document.removeEventListener('visibilitychange',pause);removeEventListener('blur',pause);controller.abort();release?.();void flush();},total};
}
