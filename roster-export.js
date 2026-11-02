const date=value=>value?new Date(value).toISOString().replace('T',' ').slice(0,19):'';
const role=value=>value==='lecturer'?'Instructor':value?value[0].toUpperCase()+value.slice(1):'Student';
const userColumns=[['First name','firstName',20],['Last name','lastName',22],['Role','roleLabel',16],['Sign-in email','email',34],['University email','contactEmail',34],['University ID','studentId',22],['School / university','affiliation',32],['Pen name','penName',24],['Modules joined','joined',42],['Modules taught','taught',42],['Account status','status',26],['First seen (UTC)','first',24],['Last sign-in (UTC)','signIn',24],['Last activity (UTC)','seen',24],['User ID','uid',36]];
const invitationColumns=[['Invitation type','kindLabel',18],['First name','firstName',20],['Last name','lastName',22],['University email','universityEmail',34],['Google / sign-in email','googleEmail',34],['University ID','studentId',22],['School / university','affiliation',32],['Module / access','moduleTitle',38],['Invited by','invitedBy',24],['Invitation code','code',20],['Status','status',26],['Students registered','registeredCount',22],['Created (UTC)','created',24],['Expires (UTC)','expires',24],['Invitation ID','id',38]];

// Every sheet shares one style: bold white headings on blue, frozen first row,
// normal body text, every cell formatted as text so IDs keep their zeros.
function addSheet(workbook,name,columns,rows){
 const ws=workbook.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});
 ws.columns=columns.map(([header,key,width])=>({header,key,width}));
 for(const source of rows){const row=ws.addRow(Object.fromEntries(columns.map(([,key])=>[key,source[key]==null?'':String(source[key])])));row.font={name:'Calibri',size:11,bold:false};row.alignment={vertical:'top',wrapText:true};row.eachCell(cell=>{cell.numFmt='@';});}
 const header=ws.getRow(1);header.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF24599E'}};header.alignment={vertical:'middle',wrapText:true};header.height=32;
 ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,ws.rowCount),column:columns.length}};
 return ws;
}

export function createRosterWorkbook(ExcelJS,report){
 const workbook=new ExcelJS.Workbook();workbook.creator='UCD blog';workbook.created=new Date(report.generatedAt||Date.now());
 const sheet=(name,columns,rows)=>addSheet(workbook,name,columns,rows);
 sheet('Users',userColumns,report.users.map(u=>({...u,roleLabel:role(u.role),joined:u.moduleNames?.join('; ')||'',taught:u.teachingModuleNames?.join('; ')||'',first:date(u.firstSeen),signIn:date(u.lastSignIn),seen:date(u.lastSeen)})));
 for(const [name,kind] of [['Instructor invitations','instructor'],['Student invitations','student']]){
  const rows=report.invitations.filter(i=>i.kind===kind);
  if(kind==='instructor'&&!rows.length&&!report.includeInstructorSheet)continue;
  sheet(name,invitationColumns,rows.map(i=>({...i,kindLabel:role(i.kind),created:date(i.createdAt),expires:date(i.expiresAt)})));
 }
 sheet('Post writing time',[['Post title','title',40],['Module','moduleTitle',32],['First name','firstName',20],['Last name','lastName',22],['Sign-in email','email',34],['University email','contactEmail',34],['University ID','studentId',22],['Status','status',18],['Writing / editing time (H:MM:SS)','writingTime',34],['Writing / editing seconds','seconds',24],['Post ID','postId',38]],report.writing||[]);
 sheet('Writing sessions',[['Post title','title',40],['Module','moduleTitle',32],['First name','firstName',20],['Last name','lastName',22],['University email','contactEmail',34],['University ID','studentId',22],['Session start (UTC)','start',24],['Last edit (UTC)','activity',24],['Session end (UTC)','end',24],['Last recorded (UTC)','recorded',24],['Active time (H:MM:SS)','writingTime',26],['Active seconds','seconds',18],['Session state / pause reason','reason',32],['Post ID','postId',38],['Session ID','sessionId',40]],(report.sessions||[]).map(s=>({...s,start:date(s.startedAt),activity:date(s.lastActivityAt),end:date(s.endedAt),recorded:date(s.lastRecordedAt),reason:s.endReason==='legacy'?'Legacy editor visit; detailed timestamps unavailable':s.endReason==='checkpoint'?'Last checkpoint; end not recorded':s.endReason})));
 sheet('Student module totals',[['Module','moduleTitle',34],['Module code','code',20],['Academic year','academicYear',20],['First name','firstName',20],['Last name','lastName',22],['University email','contactEmail',34],['Sign-in email','email',34],['University ID','studentId',22],['School / university','affiliation',32],['Posts','postCount',14],['Total active time (H:MM:SS)','writingTime',30],['Total active seconds','seconds',22],['Module ID','moduleId',38],['User ID','authorId',38]],report.moduleTotals||[]);
 return workbook;
}

let library;
async function loadExcel(){
 if(globalThis.ExcelJS)return globalThis.ExcelJS;
 if(!library)library=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('./vendor/exceljs.min.js',import.meta.url).href;s.onload=()=>globalThis.ExcelJS?resolve(globalThis.ExcelJS):reject(Error('Excel export could not load.'));s.onerror=()=>{library=null;reject(Error('Excel export could not load. Please try again.'));};document.head.append(s);});
 return library;
}
async function saveWorkbook(workbook,filename){
 const buffer=await workbook.xlsx.writeBuffer();
 const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function createSheetWorkbook(ExcelJS,name,columns,rows){
 const workbook=new ExcelJS.Workbook();workbook.creator='UCD blog';workbook.created=new Date();
 addSheet(workbook,name,columns,rows);return workbook;
}
export async function downloadExcelSheet(name,columns,rows,filename){
 await saveWorkbook(createSheetWorkbook(await loadExcel(),name,columns,rows),filename);
}
export async function downloadRosterExcel(report,filename='ucd-blog-users.xlsx'){
 const ExcelJS=await loadExcel(),workbook=createRosterWorkbook(ExcelJS,report),buffer=await workbook.xlsx.writeBuffer();
 const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
