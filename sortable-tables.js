export function compareTableValues(a,b){
 if(a==null||a==='')return b==null||b===''?0:1;
 if(b==null||b==='')return -1;
 if(typeof a==='number'&&typeof b==='number')return a-b;
 return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});
}
export function makeTablesSortable(root){
 for(const table of root.querySelectorAll('table')){
  const body=table.tBodies[0],rows=body?[...body.rows]:[];
  if(!body)continue;
  let active=-1,direction=0;
  const headings=[...table.querySelectorAll('thead th')];
  headings.forEach((th,column)=>{
   const label=th.textContent,button=document.createElement('button');button.type='button';button.className='sort-heading';button.textContent=label+' ↕';button.title='Sort ascending, descending, then restore original order';th.replaceChildren(button);th.setAttribute('aria-sort','none');
   button.onclick=()=>{
    direction=active===column?(direction+1)%3:1;active=column;
    const value=row=>{const cell=row.cells[column],v=cell?.dataset.sortValue;return v!==undefined?(v!==''&&Number.isFinite(Number(v))?Number(v):v):cell?.textContent.trim();};
    const sorted=direction?[...rows].sort((a,b)=>(direction===1?1:-1)*compareTableValues(value(a),value(b))||rows.indexOf(a)-rows.indexOf(b)):rows;
    if(rows[0]?.cells.length>1)body.replaceChildren(...sorted);
    headings.forEach((h,i)=>{h.setAttribute('aria-sort',i===active&&direction?(direction===1?'ascending':'descending'):'none');h.firstElementChild.textContent=h.firstElementChild.textContent.replace(/ [↕↑↓]$/,'')+' '+(i===active&&direction?(direction===1?'↑':'↓'):'↕');});
   };
  });
 }
}
