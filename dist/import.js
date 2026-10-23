import {unzipSync,strFromU8} from './fflate.js';
import {cents,periodDates,uuid} from './logic.js';
const xml=text=>{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('This workbook contains invalid XML.');return doc;};
export function readWorkbook(buffer){
 const data=new Uint8Array(buffer);if(data.length>10*1024*1024)throw new Error('Please upload an Excel file smaller than 10 MB.');
 let bytes=0;const files=unzipSync(data,{filter:f=>{bytes+=f.originalSize;if(bytes>30*1024*1024)throw new Error('The workbook is too large when uncompressed.');return /^xl\/(workbook\.xml|_rels\/workbook\.xml.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(f.name);}});
 const get=name=>{if(!files[name])throw new Error('This file is not a supported .xlsx workbook.');return xml(strFromU8(files[name]));};
 const strings=files['xl/sharedStrings.xml']?[...get('xl/sharedStrings.xml').getElementsByTagName('si')].map(e=>e.textContent):[];
 const relations=Object.fromEntries([...get('xl/_rels/workbook.xml.rels').getElementsByTagName('Relationship')].map(e=>[e.getAttribute('Id'),e.getAttribute('Target')]));
 return [...get('xl/workbook.xml').getElementsByTagName('sheet')].map(sheet=>{let target=relations[sheet.getAttribute('r:id')];if(!target)throw new Error('Missing worksheet relationship.');target=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');const doc=get(target),cells={};for(const cell of doc.getElementsByTagName('c')){let v=cell.getElementsByTagName('v')[0]?.textContent??cell.getElementsByTagName('is')[0]?.textContent??'';if(cell.getAttribute('t')==='s')v=strings[Number(v)];cells[cell.getAttribute('r')]={value:v,formula:cell.getElementsByTagName('f')[0]?.textContent};}return{name:sheet.getAttribute('name').trim(),cells};});
}
export function dateFromNote(note,year,periodMonth){
 const monthNames='jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
 const byDay=new RegExp('\\b(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+('+monthNames+')\\b','i').exec(note);
 const byMonth=new RegExp('\\b('+monthNames+')\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b','i').exec(note);
 if(!byDay&&!byMonth)return null;
 const day=Number(byDay?byDay[1]:byMonth[2]),word=(byDay?byDay[2]:byMonth[1]).slice(0,3).toLowerCase();
 const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(word)+1;
 if(day<1||day>31)return null;
 const explicit=/\b(20\d{2})\b/.exec(note);const y=explicit?Number(explicit[1]):Number(year)-(periodMonth===1&&month===12?1:0);
 const date=`${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 return new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date?date:null;
}
export function prepareImport(sheets,year){
 if(!Number.isInteger(Number(year))||Number(year)<2000||Number(year)>2100)throw new Error('Choose a year between 2000 and 2100.');
 const names=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];const periods=[],entries=[];
 for(const sheet of sheets){const month=names.findIndex(n=>sheet.name.toLowerCase().startsWith(n))+1;if(!month)continue;
 const c=sheet.cells,label=r=>String(c['A'+r]?.value||'').trim(),num=r=>c['B'+r]?.value===''||c['B'+r]?.value==null?null:cents(c['B'+r].value),note=r=>String(c['C'+r]?.value||'').trim();
 const payRow=Array.from({length:80},(_,i)=>i+1).find(r=>/^pay$/i.test(label(r)));if(!payRow)continue;
 const id=uuid(),dates=periodDates(year,month);if(month===1&&/Dec\s*9/i.test(label(1)))dates.start_date=`${year-1}-12-09`;
 const lastRow=Math.max(...Object.keys(c).map(k=>Number(k.replace(/[A-Z]/g,''))));const totalRows=Array.from({length:lastRow},(_,i)=>i+1).filter(r=>/^(total|carried f[ao]rward)$/i.test(label(r)));const totalRow=totalRows.at(-1);
 const priorRow=Array.from({length:lastRow},(_,i)=>i+1).find(r=>/^previous month/i.test(label(r)));
 const remainingRow=Array.from({length:lastRow},(_,i)=>i+1).find(r=>/^remaining$/i.test(label(r)));
 const planned=dates.start_date>new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
 const p={id,month,...dates,base_pay_cents:num(payRow)||0,opening_override_cents:priorRow?(num(priorRow)??0):month===1?0:null,status:planned?'planned':'review',source_total_cents:totalRow?num(totalRow):null,source_sheet:{name:sheet.name,cells:structuredClone(c)},notes:`Imported from ${sheet.name}. ${label(1)}. Source amounts preserved; blank previous-month cells are treated as zero, matching Excel. Clear the opening override to carry automatically. Explicit dates and clearly described dated cash/Zelle receipts are imported. Review pending items and missing dates before using balances.`};periods.push(p);
 const add=(r,kind,description,amount,status='confirmed')=>{
  if(amount==null||amount===0)return;
  const originalKind=kind,entry_date=dateFromNote(note(r),year,month);
  if(kind==='payment'&&amount<0){kind='adjustment';description='Reversal: '+description;amount=-amount;}
  else if(kind==='payment'&&/^adjusted$/i.test(note(r))){kind='adjustment';amount=-amount;}
  else if(kind!=='adjustment'&&amount<0)throw new Error(`Review the negative amount at ${sheet.name}!B${r}.`);
  const method=/zell(?:e|ed)/i.test(note(r))?'Zelle':/cash/i.test(note(r))?'Cash':originalKind==='payment'?'Other':'';
  if(kind==='payment'&&entry_date&&['Zelle','Cash'].includes(method)&&!/(need|request|expect|pending)/i.test(note(r)))status='confirmed';
  entries.push({id:uuid(),period_id:id,kind,description,amount_cents:amount,entry_date,method,status,notes:note(r),source_ref:`${sheet.name}!B${r}`});
 };
 for(let r=2;r<payRow;r++)if(num(r)!=null&&!c['B'+r]?.formula&&label(r))add(r,'deduction',label(r),num(r));
 for(let r=payRow+1;r<(remainingRow||lastRow);r++){
  const l=label(r);if(num(r)==null||c['B'+r]?.formula||!l||/previous month/i.test(l))continue;
  if(/^(expenses|sent home)$/i.test(l)){if(/^sent home$/i.test(l))add(r,'deduction',l,num(r));continue;}
  add(r,'addition',l,num(r));
 }
 if(remainingRow)for(let r=remainingRow+1;r<=(totalRow||lastRow);r++)if(num(r)!=null&&!c['B'+r]?.formula)add(r,'payment',note(r)||label(r)||'Payment — details needed',num(r),'pending');
 }
 if(new Set(periods.map(p=>p.month)).size!==periods.length)throw new Error('The workbook has duplicate monthly tabs.');
 if(!periods.length)throw new Error('No PRID pay tabs found. Use tabs named Jan, Feb, Mar… with a Pay row.');
 return{periods,entries};
}
