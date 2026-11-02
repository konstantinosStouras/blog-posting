// Work only from the already-authorised staff report, using both identity keys.
export function studentWritingBreakdown(report,authorId,moduleId){
 const total=(report.moduleTotals||[]).find(r=>r.authorId===authorId&&r.moduleId===moduleId);
 if(!total)return null;
 const posts=(report.writing||[]).filter(p=>p.authorId===authorId&&p.moduleId===moduleId).map(p=>({...p,sessions:(report.sessions||[]).filter(s=>s.postId===p.postId&&s.authorId===authorId&&s.moduleId===moduleId)}));
 return {total,posts};
}
