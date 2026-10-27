import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as logic from '../dist/logic.js';
import {prepareImport,readWorkbook} from '../dist/import.js';

// Exercise generated screens without network access or a signed-in browser.
function app(){
 const elements=new Map();
 const element=()=>({innerHTML:'',textContent:'',addEventListener(){},querySelector(){return null;},showModal(){this.open=true;},close(){this.open=false;},classList:{add(){},remove(){}}});
 for(const id of ['#app','#dialog','#dialog-body','#toast'])elements.set(id,element());
 const document={querySelector:s=>elements.get(s)||null,querySelectorAll:()=>[],addEventListener(){}};
 const context=vm.createContext({...logic,esc:logic.escapeHtml,prepareImport,readWorkbook,document,window:{addEventListener(){}},api:{},structuredClone,console,setTimeout,clearTimeout});
 const code=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/\ninit\(\);\s*$/,'');
 vm.runInContext(code+'\nthis.testApp={state,overview,periodView,settings,render,deleteAllData,categoryField,editEntry,moneyChart,setModal:fn=>modal=fn};',context);
 const a=context.testApp;
 Object.assign(a.state,{user:{id:'owner',email:'sample@example.invalid'},ledger:{id:'ledger',owner_id:'owner',name:'Test ledger',default_pay_cents:250000,opening_due_cents:0},year:2026,periods:[{id:'jan',year:2026,month:1,status:'open',base_pay_cents:250000},{id:'feb',year:2026,month:2,status:'open',base_pay_cents:250000}],entries:[{id:'a',period_id:'jan',kind:'deduction',category:'Phone',description:'Mobile',amount_cents:14000,status:'confirmed'},{id:'b',period_id:'feb',kind:'deduction',category:'Books & courses',description:'Learning',amount_cents:5000,status:'confirmed'}]});
 return {a,elements};
}
test('Overview renders all months, one month, all years and dynamic category labels',()=>{
 const {a}=app();let html=a.overview();assert.match(html,/Select dashboard month/);assert.match(html,/Books &amp; courses/);assert.match(html,/January 2026/);assert.match(html,/February 2026/);assert.match(html,/Opening carry/);assert.match(html,/Deductions/);
 a.state.dashboardMonth=1;html=a.overview();assert.match(html,/January 2026/);assert.doesNotMatch(html,/Books &amp; courses/);assert.doesNotMatch(html,/February 2026/);
 a.state.selected='jan';const monthly=a.periodView();assert.match(monthly,/Deductions/);assert.match(monthly,/Confirmed deductions in this selection/);assert.match(monthly,/\$140\.00/);assert.match(monthly,/Carried forward/);a.state.dashboardMonth=2;html=a.overview();assert.match(html,/Opening carry[\s\S]*?\$2,360\.00/);
 a.state.overviewScope='all';html=a.overview();assert.match(html,/Books &amp; courses/);assert.match(html,/Year-by-year statement/);
});
test('navigation keeps monthly workflow and settings exposes guarded reset only for the owner',()=>{
 const {a,elements}=app();a.render();assert.doesNotMatch(elements.get('#app').innerHTML,/data-view="(?:reports|payments|bank)"/);assert.match(elements.get('#app').innerHTML,/aria-label="Workspace navigation"/);
 assert.match(a.settings(),/Delete all my data/);a.deleteAllData();assert.match(elements.get('#dialog-body').innerHTML,/Type DELETE ALL to confirm/);assert.match(elements.get('#dialog-body').innerHTML,/type="checkbox" name="acknowledge" required/);
 a.state.user.id='manager';assert.doesNotMatch(a.settings(),/data-action="delete-all"/);assert.throws(()=>a.deleteAllData(),/Only the owner/);
});
test('categories escape custom labels and shared payroll does not display bank spending',()=>{
 const {a}=app();a.state.entries.push({period_id:'jan',kind:'deduction',status:'confirmed',amount_cents:100,category:'<script>custom</script>'});
 assert.match(a.overview(),/&lt;script&gt;custom&lt;\/script&gt;/);assert.match(a.categoryField('New hobby'),/value="New hobby"/);
 a.state.categorySource='bank';a.state.bankEntries=[{entry_date:'2026-01-01',amount_cents:-500,category:'Private bank category'}];a.state.user.id='manager';assert.doesNotMatch(a.overview(),/Private bank category/);
});

test('monthly entry form locks the current month for adds and edits without offering expenses',async()=>{
 const {a}=app();a.state.demo=true;a.state.view='period';a.state.selected='jan';let form;
 a.setModal((title,body,submit)=>{form={title,body,submit};});
 a.editEntry(null,'jan');assert.match(form.title,/January 2026/);assert.doesNotMatch(form.body,/name="period"/);assert.doesNotMatch(form.body,/value="expense"/);assert.match(form.body,/value="payment"/);
 await form.submit(new Map(Object.entries({period:'feb',kind:'deduction',status:'confirmed',amount:'12.50',description:'Test charge',category:'Transport',date:'2026-01-10',method:'',notes:''})));
 assert.equal(a.state.entries.at(-1).period_id,'jan');assert.equal(a.state.entries.at(-1).amount_cents,1250);
 const added=a.state.entries.at(-1);a.editEntry(added.id);assert.doesNotMatch(form.body,/name="period"/);
 await form.submit(new Map(Object.entries({period:'feb',kind:'deduction',status:'confirmed',amount:'13.50',description:'Updated charge',category:'Transport',date:'2026-01-11',method:'',notes:''})));
 assert.equal(a.state.entries.find(e=>e.id===added.id).period_id,'jan');assert.equal(a.state.entries.find(e=>e.id===added.id).amount_cents,1350);
});
test('all five chart series render exact values with zero, negative and unrecorded states',()=>{
 const {a}=app();const html=a.moneyChart([{label:'Jan',opening:-10000,earned:236000,payments:300000,deductions:14000,closing:-74000},{label:'Feb',recorded:false}],'Pay');
 assert.equal((html.match(/<figure /g)||[]).length,5);for(const name of ['Opening carry','Net earned','Received','Deductions','Carried forward'])assert.ok(html.includes(name));
 assert.ok(html.includes('-$740.00'));assert.ok(html.includes('$140.00'));assert.ok(html.includes('not recorded'));assert.ok(!html.includes('NaN'));
 const zero=a.moneyChart([{label:'Mar',opening:0,earned:0,payments:0,deductions:0,closing:0}],'Pay');assert.equal((zero.match(/<circle /g)||[]).length,5);assert.ok(!zero.includes('NaN'));
 a.state.overviewScope='all';const all=a.overview();assert.ok(all.includes('Carried forward'));assert.equal((all.match(/<figure /g)||[]).length,5);
});
