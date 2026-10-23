export const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
export const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value||0)/100);
export const cents = value => { const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>1000000000)throw new Error('Enter a valid amount below $1 billion.');return Math.round(n*100); };
export const dateText = value => value ? new Date(value+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Date needed';
export const periodDates=(year,month)=>({start_date:month===1?`${year-1}-12-19`:`${year}-${String(month-1).padStart(2,'0')}-19`,end_date:`${year}-${String(month).padStart(2,'0')}-18`});
export function payroll(periods,entries,opening=0){
 let carry=Number(opening);const out=[];
 for(const p of [...periods].sort((a,b)=>a.year-b.year||a.month-b.month)){
  const rows=entries.filter(e=>e.period_id===p.id),sum=k=>rows.filter(e=>e.kind===k&&e.status==='confirmed').reduce((s,e)=>s+Number(e.amount_cents),0);
  const start=p.opening_override_cents==null?carry:Number(p.opening_override_cents),additions=sum('addition'),deductions=sum('deduction'),payments=sum('payment'),adjustments=sum('adjustment');
  const earned=Number(p.base_pay_cents)+additions-deductions+adjustments,closing=start+earned-payments;
  out.push({...p,opening:start,additions,deductions,payments,adjustments,earned,closing,rows,pending:rows.filter(e=>e.status==='pending').length,carryDifference:p.opening_override_cents==null?0:start-carry});
  if(p.status!=='planned')carry=closing;
 }
 return out;
}
export function bankSummary(year,month,settings,entries){
 let carry=0;const target=year*12+month;
 const keys=[...new Set([...settings.map(s=>s.year*12+s.month),...entries.map(e=>Number(e.entry_date.slice(0,4))*12+Number(e.entry_date.slice(5,7))),target])].sort((a,b)=>a-b);
 let result;
 for(const k of keys){if(k>target)break;const y=Math.floor((k-1)/12),m=k-y*12,setting=settings.find(s=>s.year===y&&s.month===m),prefix=`${y}-${String(m).padStart(2,'0')}`;
 const rows=entries.filter(e=>e.entry_date.startsWith(prefix)),opening=setting?.opening_override_cents==null?carry:Number(setting.opening_override_cents),income=rows.filter(e=>e.amount_cents>0).reduce((s,e)=>s+Number(e.amount_cents),0),expenses=rows.filter(e=>e.amount_cents<0).reduce((s,e)=>s-Number(e.amount_cents),0),closing=opening+income-expenses;
 result={opening,income,expenses,closing,rows,actual:setting?.actual_close_cents,variance:setting?.actual_close_cents==null?null:Number(setting.actual_close_cents)-closing,setting};carry=closing;
 }return result;
}
export function csv(rows){return rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s)&&!/^[-+]?[0-9]+(?:\.[0-9]+)?$/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const uuid=()=> typeof crypto.randomUUID==='function'?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^(crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c)/4)).toString(16));

export function yearlySummary(periods,entries,opening=0){
 const calculated=payroll(periods,entries,opening),years=[...new Set(calculated.map(p=>p.year))].sort((a,b)=>a-b);
 return years.map(year=>{const all=calculated.filter(p=>p.year===year),active=all.filter(p=>p.status!=='planned'),sum=k=>active.reduce((n,p)=>n+Number(p[k]||0),0);
  return {year,earned:sum('earned'),payments:sum('payments'),deductions:sum('deductions'),base:sum('base_pay_cents'),additions:sum('additions'),opening:active[0]?.opening??null,closing:active.at(-1)?.closing??null,active:active.length,planned:all.length-active.length,pending:all.reduce((n,p)=>n+p.pending,0)};
 });
}
