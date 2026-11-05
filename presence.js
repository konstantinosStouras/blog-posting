// Presence: when an account is signed in on the site. A visit (one browser tab, from the page load
// until it is closed) writes a presence row per module the account belongs to or teaches (the admin
// writes one row with no module, readable by the admin alone), stamped with the visit's start and the
// last minute it was seen; the tab beats once a minute while it is open, hidden or not, since a
// student who leaves the tab open is still signed in on the site. Explicit sign-outs also save
// signedOutAt. Uncovered time without a sign-out is unknown, not evidence of time away.
export const PRESENCE_SINCE=Date.UTC(2026,10,4);   // 4 Nov 2026 UTC: the first day visits were recorded
export const BEAT_MS=60000;

// The seconds of [from, to] covered by the union of the intervals ({startedAt, lastSeenAt}).
export function coveredSeconds(intervals=[],from=0,to=0){
 if(!(to>from))return 0;
 const spans=intervals.map(i=>[Math.max(from,Number(i.startedAt)||0),Math.min(to,Number(i.lastSeenAt)||0)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
 let covered=0,start=0,end=0;
 for(const [a,b] of spans){if(end&&a<=end){end=Math.max(end,b);continue;}if(end)covered+=end-start;start=a;end=b;}
 if(end)covered+=end-start;
 return Math.floor(covered/1000);
}

// A delayed heartbeat is not a sign-out. Keep the visit while authentication remains
// unchanged; only an explicit sign-out establishes an away interval.
export function startPresence({uid,modules=()=>[],save,now=Date.now,newId=()=>crypto.randomUUID(),intervalMs=BEAT_MS,doc=globalThis.document,win=globalThis.window}) {
 const rows = new Map();
 let stopped = false, pending = Promise.resolve();
 function beat(signedOut = false) {
  const seen = now();
  if (stopped) return pending;
  const snapshots = [...new Set(modules())].map(moduleId => {
   if (!rows.has(moduleId)) rows.set(moduleId, {id: newId()+':'+(moduleId||'site'),uid,moduleId,startedAt:seen});
   return {...rows.get(moduleId),lastSeenAt:seen,...(signedOut?{signedOutAt:seen}:{})};
  });
  pending = pending.then(async () => {
   for (const row of snapshots) {
    try { await save(row); }
    catch (error) { console.warn('presence',error?.code||error?.message||error); }
   }
  });
  return pending;
 }
 const timer = setInterval(beat,intervalMs);
 const onVisibility = () => { void beat(); };
 const onPageHide = () => { void beat(); };
 doc?.addEventListener?.('visibilitychange',onVisibility);
 win?.addEventListener?.('pagehide',onPageHide);
 void beat();
 async function flush(timeoutMs=2000, signedOut=false) {
  let timeout;
  try {
   const write=beat(signedOut);
   if(signedOut) stopped=true;
   await Promise.race([write, new Promise(resolve => { timeout=setTimeout(resolve,timeoutMs); })]);
  } finally { clearTimeout(timeout); }
 }
 return {beat,flush,signOut:()=>flush(2000,true),stop() {
  stopped=true;
  clearInterval(timer);
  doc?.removeEventListener?.('visibilitychange',onVisibility);
  win?.removeEventListener?.('pagehide',onPageHide);
  return pending;
 }};
}
