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
 vm.runInContext(code+'\nthis.testApp={state,overview,settings,render,deleteAllData,categoryField};',context);
 const a=context.testApp;
 Object.assign(a.state,{user:{id:'owner',email:'sample@example.invalid'},ledger:{id:'ledger',owner_id:'owner',name:'Test ledger',default_pay_cents:250000,opening_due_cents:0},year:2026,periods:[{id:'jan',year:2026,month:1,status:'open',base_pay_cents:250000},{id:'feb',year:2026,month:2,status:'open',base_pay_cents:250000}],entries:[{id:'a',period_id:'jan',kind:'deduction',category:'Phone',description:'Mobile',amount_cents:14000,status:'confirmed'},{id:'b',period_id:'feb',kind:'deduction',category:'Books & courses',description:'Learning',amount_cents:5000,status:'confirmed'}]});
 return {a,elements};
}
test('Overview renders all months, one month, all years and dynamic category labels',()=>{
 const {a}=app();let html=a.overview();assert.match(html,/Select dashboard month/);assert.match(html,/Books &amp; courses/);assert.match(html,/January 2026/);assert.match(html,/February 2026/);
 a.state.dashboardMonth=1;html=a.overview();assert.match(html,/January 2026/);assert.doesNotMatch(html,/Books &amp; courses/);assert.doesNotMatch(html,/February 2026/);
 a.state.overviewScope='all';html=a.overview();assert.match(html,/Books &amp; courses/);assert.match(html,/Year-by-year statement/);
});
test('navigation removes Reports and settings exposes guarded reset only for the owner',()=>{
 const {a,elements}=app();a.render();assert.doesNotMatch(elements.get('#app').innerHTML,/data-view="reports"/);assert.match(elements.get('#app').innerHTML,/aria-label="Workspace navigation"/);
 assert.match(a.settings(),/Delete all my data/);a.deleteAllData();assert.match(elements.get('#dialog-body').innerHTML,/Type DELETE ALL to confirm/);assert.match(elements.get('#dialog-body').innerHTML,/type="checkbox" name="acknowledge" required/);
 a.state.user.id='manager';assert.doesNotMatch(a.settings(),/data-action="delete-all"/);assert.throws(()=>a.deleteAllData(),/Only the owner/);
});
test('categories escape custom labels and shared payroll does not display bank spending',()=>{
 const {a}=app();a.state.entries.push({period_id:'jan',kind:'deduction',status:'confirmed',amount_cents:100,category:'<script>custom</script>'});
 assert.match(a.overview(),/&lt;script&gt;custom&lt;\/script&gt;/);assert.match(a.categoryField('New hobby'),/value="New hobby"/);
 a.state.categorySource='bank';a.state.bankEntries=[{entry_date:'2026-01-01',amount_cents:-500,category:'Private bank category'}];a.state.user.id='manager';assert.doesNotMatch(a.overview(),/Private bank category/);
});
