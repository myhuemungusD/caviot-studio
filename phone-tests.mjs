// Phone phase-1 helpers in plain Node: device limits per tier, the STL triangle pre-check, the autosave record
// rules (restore / offer / expire), the reload-after-heavy-job notice, and that desktop never runs the autosave.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const dist=new URL('./dist/',import.meta.url),src=f=>fs.readFileSync(new URL(f,dist),'utf8');
function device(nav,{width=1440,height=900,query={}}={}){
  const c={navigator:nav,window:{screen:{width,height},innerWidth:width,innerHeight:height,location:{search:query.search||''},localStorage:{getItem:k=>query.store?.[k]??null},matchMedia:q=>({matches:!!query.mq?.(q)})},document:{documentElement:{classList:{toggle(){}},dataset:{}}},URLSearchParams,DataView,Uint8Array,Math,Number,Infinity};
  c.globalThis=c;vm.createContext(c);vm.runInContext(src('device-tier.js')+'\n;globalThis.__D=CaviotDevice;',c);return c.__D;
}
const iphone={userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',maxTouchPoints:5,platform:'iPhone'};
const desktop={userAgent:'Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36',maxTouchPoints:0,platform:'Linux x86_64',deviceMemory:8};
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS '+name)};

test('desktop keeps its limits: 300k preview copy, 2M-triangle STL limit, no warnings, no image cap',()=>{
  const D=device(desktop);assert.equal(D.detected,'full');assert.equal(D.device.displayTriangles,300000);assert.equal(D.device.customMaxTriangles,2000000);
  assert.equal(D.device.customWarnTriangles,Infinity);assert.equal(D.device.exportTriangleBudget,Infinity);assert.equal(D.device.maxImageSide,Infinity);
});
test('a phone gets the audited limits, even with Full export quality picked',()=>{
  const D=device(iphone,{width:390,height:844,query:{store:{'caviot.exportQuality':'full'}}});assert.equal(D.detected,'light');assert.equal(D.tier,'full');
  assert.deepEqual({...D.device},{displayTriangles:120000,customWarnTriangles:600000,customMaxTriangles:1200000,exportTriangleBudget:700000,maxImageSide:2048});
});
test('?tier=light applies the phone guards on a computer (for testing)',()=>{const D=device(desktop,{query:{search:'?tier=light'}});assert.equal(D.device.customWarnTriangles,600000)});
test('STL triangle count from the binary header; ASCII and bogus headers are estimated from the size',()=>{
  const D=device(desktop),head=n=>{const b=new Uint8Array(84);new DataView(b.buffer).setUint32(80,n,true);return b};
  assert.deepEqual({...D.stlTriangles(head(804000),84+804000*50)},{count:804000,estimated:false});
  assert.deepEqual({...D.stlTriangles(head(1000),84+1000*50+80)},{count:1000,estimated:false},'a little trailing data is fine');
  assert.equal(D.stlTriangles(head(5e6),84+1000*50).estimated,true,'a count larger than the file is not trusted');
  assert.equal(D.stlTriangles(head(0),5000).estimated,true);
  const ascii=new TextEncoder().encode('solid part\n'.padEnd(84,' '));assert.deepEqual({...D.stlTriangles(ascii,250e6)},{count:1e6,estimated:true});
  assert.equal(D.stlTriangles(null,2500).count,10);
});
function store(D,{indexedDB}={}){
  const c={CaviotDevice:D,console,Date,JSON,Number,Math,String,Promise,setTimeout,clearTimeout,setInterval:()=>0,WeakMap,Error,
    window:{addEventListener(){},dispatchEvent(){}},document:{addEventListener(){},visibilityState:'visible'},localStorage:{v:{},getItem(k){return this.v[k]??null},setItem(k,v){this.v[k]=String(v)},removeItem(k){delete this.v[k]}},CustomEvent:class{}};
  if(indexedDB)c.indexedDB=indexedDB;c.globalThis=c;vm.createContext(c);vm.runInContext(src('project-store.js')+'\n;globalThis.__S=CaviotAutosave;',c);return {S:c.__S,c};
}
const desk=device(desktop),phone=device(iphone,{width:390,height:844});
test('desktop never enables the autosave (no IndexedDB reads or writes)',()=>{
  let opened=0;const idb={open(){opened++;throw Error('must not open')}};const {S}=store(desk,{indexedDB:idb});assert.equal(S.enabled,false);assert.equal(opened,0);
});
test('autosave record rules: restore within 12 h, offer up to 14 days, then expire; damaged records expire',()=>{
  const {S}=store(phone),now=Date.UTC(2026,9,7,12),rec=(age,extra={})=>({v:1,savedAt:now-age,name:'x',layers:1,custom:null,json:'{"format":4}',...extra}),h=3600e3;
  assert.equal(S.decide(null,now),'none');
  assert.equal(S.decide(rec(5*60e3),now),'restore');assert.equal(S.decide(rec(12*h),now),'restore');
  assert.equal(S.decide(rec(12*h+1),now),'offer');assert.equal(S.decide(rec(14*24*h),now),'offer');assert.equal(S.decide(rec(14*24*h+1),now),'expire');
  assert.equal(S.decide(rec(-2*h),now),'expire','a record from the future (clock change) is not trusted');
  assert.equal(S.decide(rec(0,{v:2}),now),'expire');assert.equal(S.decide(rec(0,{json:''}),now),'expire');assert.equal(S.decide(rec(0,{json:'x'.repeat(S.LIMITS.maxBytes+1)}),now),'expire');
  assert.equal(S.decide(rec(0,{custom:{name:'tube'}}),now),'restore');assert.equal(S.decide(rec(0,{custom:{}}),now),'expire');
  assert(S.LIMITS.maxBytes<36*1024*1024,'size cap stays below the project format limit');
});
test('heavy-job notice: only load/export markers from the last 15 minutes',()=>{
  const {S}=store(phone),now=1e12;
  assert.equal(S.heavyNotice(JSON.stringify({kind:'export',at:now-60e3}),now).kind,'export');
  assert.equal(S.heavyNotice(JSON.stringify({kind:'load',at:now-16*60e3}),now),null);
  assert.equal(S.heavyNotice(JSON.stringify({kind:'other',at:now}),now),null);assert.equal(S.heavyNotice('{bad',now),null);assert.equal(S.heavyNotice(null,now),null);
});
test('takeHeavyNotice reads the marker once',()=>{
  const {S,c}=store(phone);c.localStorage.setItem('caviot.heavyOp',JSON.stringify({kind:'export',at:Date.now()}));
  assert.equal(S.takeHeavyNotice().kind,'export');assert.equal(S.takeHeavyNotice(),null);
});
test('index.html loads the phone scripts after mobile.js and before pwa.js; the service worker caches them',()=>{
  const html=src('index.html'),i=f=>html.indexOf('<script src="'+f+'"></script>');
  assert(i('mobile.js')>0&&i('mobile.js')<i('project-store.js')&&i('project-store.js')<i('phone-ui.js')&&i('phone-ui.js')<i('pwa.js'));
  assert(html.includes('href="phone-ui.css"'));const sw=src('sw.js');for(const f of ['project-store.js','phone-ui.js','phone-ui.css'])assert(sw.includes(f),f+' precached');
});
console.log(`phone-tests: ${passed} passed`);
