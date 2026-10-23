import test from 'node:test';
import assert from 'node:assert/strict';
import {payroll,bankSummary,cents,csv,periodDates} from '../dist/logic.js';
import {prepareImport} from '../dist/import.js';
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
