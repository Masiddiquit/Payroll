import test from 'node:test';
import assert from 'node:assert/strict';
import {payroll,yearlySummary,bankSummary,cents,csv,periodDates} from '../dist/logic.js';
import {prepareImport,dateFromNote} from '../dist/import.js';
const period=(id,year,month,extra={})=>({id,year,month,base_pay_cents:250000,...extra});
const entry=(period_id,kind,amount_cents,status='confirmed')=>({period_id,kind,amount_cents,status});
test('carry tracks additions, deductions, multiple receipts and advances across years',()=>{
 const rows=payroll([period('a',2025,12),period('b',2026,1)],[entry('a','addition',10000),entry('a','deduction',14000),entry('a','payment',250000),entry('b','payment',100000)],20000);
 assert.equal(rows[0].closing,16000);assert.equal(rows[1].opening,16000);assert.equal(rows[1].closing,166000);
});
test('pending money does not change actual balance, planned pay does not flow into next month',()=>{
 const r=payroll([period('a',2026,1),period('b',2026,2,{status:'planned'}),period('c',2026,3)],[entry('a','payment',100000,'pending')]);
 assert.equal(r[0].closing,250000);assert.equal(r[0].pending,1);assert.equal(r[2].opening,250000);
});
test('negative carry and signed reversal are exact in cents',()=>{
 const r=payroll([period('a',2026,1),period('b',2026,2)],[entry('a','payment',260000),entry('b','adjustment',105500),entry('b','deduction',2999)]);
 assert.equal(r[0].closing,-10000);assert.equal(r[1].closing,342501);assert.equal(cents('29.99'),2999);assert.throws(()=>cents('abc'));
});
test('opening overrides are visible resets',()=>{
 const r=payroll([period('a',2026,1),period('b',2026,2,{opening_override_cents:-18000})],[]);
 assert.equal(r[1].opening,-18000);assert.equal(r[1].carryDifference,-268000);
});
test('bank carries across December/January independently, and compares actual closing',()=>{
 const b=bankSummary(2026,1,[{year:2025,month:12,opening_override_cents:100000},{year:2026,month:1,actual_close_cents:125000}],[{entry_date:'2025-12-31',amount_cents:50000},{entry_date:'2026-01-02',amount_cents:-30000}]);
 assert.equal(b.opening,150000);assert.equal(b.closing,120000);assert.equal(b.variance,5000);
});
test('bank manual opening and zero actual balance are respected',()=>{
 const b=bankSummary(2026,10,[{year:2026,month:10,opening_override_cents:5000,actual_close_cents:0}],[]);assert.equal(b.closing,5000);assert.equal(b.variance,-5000);
});
test('period dates cross calendar years and CSV escapes spreadsheet injection',()=>{
 assert.deepEqual(periodDates(2026,1),{start_date:'2025-12-19',end_date:'2026-01-18'});assert.match(csv([['=HYPERLINK("bad")',-100]]),/"'=HYPERLINK/);
});
test('workbook staging keeps requests pending and negative receipts as reviewable reversals',()=>{
 const c={A1:{value:'May 19th - June 18th'},A3:{value:'Expenses'},A4:{value:'Mobile'},B4:{value:'140'},A10:{value:'Pay'},B10:{value:'2500'},A11:{value:'Rent'},B11:{value:'400'},A12:{value:'Previous Month'},B12:{value:'100'},A16:{value:'Remaining'},B16:{value:'2860',formula:'B10+B11+B12-B4'},B18:{value:'-1055'},C18:{value:'Zelled July 1'},B19:{value:'1500'},C19:{value:'Need for home'},A21:{value:'Total'},B21:{value:'2415',formula:'B16-SUM(B18:B19)'}};
 const d=prepareImport([{name:'June',cells:c}],2024);assert.equal(d.periods[0].base_pay_cents,250000);assert.equal(d.periods[0].source_total_cents,241500);assert.equal(d.entries.find(e=>e.kind==='adjustment').amount_cents,105500);assert.equal(d.entries.filter(e=>e.status==='pending').length,2);assert.equal(d.entries.find(e=>e.kind==='addition').amount_cents,40000);
});

test('explicit note dates are imported without inventing ambiguous dates',()=>{
 assert.equal(dateFromNote('Cash on 11th may',2026,5),'2026-05-11');
 assert.equal(dateFromNote('Zelled on July 1',2026,6),'2026-07-01');
 assert.equal(dateFromNote('Sevis Fees on June 3rd',2026,6),'2026-06-03');
 assert.equal(dateFromNote('on 13 th may',2026,5),'2026-05-13');
 assert.equal(dateFromNote('Cash on 20th',2026,3),null);
 assert.equal(dateFromNote('Cash on 4-9',2026,4),null);
 assert.equal(dateFromNote('Cash on 31st February',2026,2),null);
 assert.equal(dateFromNote('Cash on 32nd May',2026,5),null);
 assert.equal(dateFromNote('Cash on December 20',2026,1),'2025-12-20');
});
test('source cells and notes are copied intact; dated receipts confirmed and requests pending',()=>{
 const cells={A1:{value:'April 19 - May 18'},A2:{value:'Pay'},B2:{value:'2500'},A3:{value:'Remaining'},B3:{value:'2500',formula:'B2'},B4:{value:'200'},C4:{value:'Cash on 11th may'},B5:{value:'100'},C5:{value:'Need for home'},A6:{value:'Total'},B6:{value:'2200',formula:'B3-B4-B5'},C6:{value:'Important closing note'}};
 const d=prepareImport([{name:'May',cells}],2026);
 assert.deepEqual(d.periods[0].source_sheet.cells,cells);
 assert.equal(d.entries[0].entry_date,'2026-05-11');assert.equal(d.entries[0].status,'confirmed');
 assert.equal(d.entries[1].status,'pending');assert.equal(d.entries[1].entry_date,null);
 cells.C6.value='changed';assert.equal(d.periods[0].source_sheet.cells.C6.value,'Important closing note');
 assert.equal(payroll(d.periods,d.entries)[0].closing,230000);
});
test('invalid years and duplicate month tabs fail before import',()=>{
 assert.throws(()=>prepareImport([],2026.5));
 const s={name:'Jan',cells:{A1:{value:'Pay'},B1:{value:'2500'}}};
 assert.throws(()=>prepareImport([s,s],2026),/duplicate/);
});

test('all-years totals include running years, keep future years and do not sum carried balances',()=>{
 const ps=[period('a',2026,10,{status:'open'}),period('b',2027,1,{status:'review'}),period('c',2028,1,{status:'planned'})];
 const es=[entry('a','payment',100000),entry('b','deduction',10000),entry('b','payment',50000,'pending')];
 const y=yearlySummary(ps,es);assert.deepEqual(y.map(x=>x.year),[2026,2027,2028]);
 assert.equal(y[0].earned,250000);assert.equal(y[0].closing,150000);
 assert.equal(y[1].opening,150000);assert.equal(y[1].closing,390000);assert.equal(y[1].pending,1);
 assert.equal(y[2].earned,0);assert.equal(y[2].planned,1);assert.equal(y[2].closing,null);
});
