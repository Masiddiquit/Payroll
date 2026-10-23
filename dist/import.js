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
export function prepareImport(sheets,year){
 const names=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];const periods=[],entries=[];
 for(const sheet of sheets){const month=names.findIndex(n=>sheet.name.toLowerCase().startsWith(n))+1;if(!month)continue;
 const c=sheet.cells,label=r=>String(c['A'+r]?.value||'').trim(),num=r=>c['B'+r]?.value===''||c['B'+r]?.value==null?null:cents(c['B'+r].value),note=r=>String(c['C'+r]?.value||'').trim();
 const payRow=Array.from({length:80},(_,i)=>i+1).find(r=>/^pay$/i.test(label(r)));if(!payRow)continue;
 const id=uuid(),dates=periodDates(year,month);if(month===1&&/Dec\s*9/i.test(label(1)))dates.start_date=`${year-1}-12-09`;
 const lastRow=Math.max(...Object.keys(c).map(k=>Number(k.replace(/[A-Z]/g,''))));const totalRows=Array.from({length:lastRow},(_,i)=>i+1).filter(r=>/^(total|carried f[ao]rward)$/i.test(label(r)));const totalRow=totalRows.at(-1);
 const priorRow=Array.from({length:lastRow},(_,i)=>i+1).find(r=>/^previous month/i.test(label(r)));
 const remainingRow=Array.from({length:lastRow},(_,i)=>i+1).find(r=>/^remaining$/i.test(label(r)));
 const planned=dates.start_date>new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
 const p={id,month,...dates,base_pay_cents:num(payRow)||0,opening_override_cents:priorRow?(num(priorRow)??0):month===1?0:null,status:planned?'planned':'review',source_total_cents:totalRow?num(totalRow):null,notes:`Imported from ${sheet.name}. ${label(1)}. Source amounts preserved; blank previous-month cells are treated as zero, matching Excel. Clear the opening override to carry automatically. Check pending payments and missing dates before using balances.`};periods.push(p);
 const add=(r,kind,description,amount,status='confirmed')=>{if(amount==null||amount===0)return;if(kind!=='adjustment'&&amount<0){kind='adjustment';description='Reversal: '+description;amount=-amount;}entries.push({id:uuid(),period_id:id,kind,description,amount_cents:amount,entry_date:null,method:/zelle/i.test(note(r))?'Zelle':/cash/i.test(note(r))?'Cash':'Other',status,notes:note(r),source_ref:`${sheet.name}!B${r}`});};
 for(let r=2;r<payRow;r++)if(num(r)!=null&&!c['B'+r]?.formula&&label(r))add(r,'deduction',label(r),num(r));
 for(let r=payRow+1;r<(remainingRow||lastRow);r++){
  const l=label(r);if(num(r)==null||c['B'+r]?.formula||!l||/previous month/i.test(l))continue;
  if(/^(expenses|sent home)$/i.test(l)){if(/^sent home$/i.test(l))add(r,'deduction',l,num(r));continue;}
  add(r,'addition',l,num(r));
 }
 if(remainingRow)for(let r=remainingRow+1;r<=(totalRow||lastRow);r++)if(num(r)!=null&&!c['B'+r]?.formula)add(r,'payment',note(r)||label(r)||'Payment — details needed',num(r),'pending');
 }
 if(!periods.length)throw new Error('No PRID pay tabs found. Use tabs named Jan, Feb, Mar… with a Pay row.');
 return{periods,entries};
}
