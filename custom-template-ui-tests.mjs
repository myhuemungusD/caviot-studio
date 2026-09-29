// Custom template UI orchestration in a stubbed DOM: cancellation, keeping the user's template choice,
// the empty Custom STL entry, worker errors, capped decompression and project-open notices.
import fs from 'node:fs';import vm from 'node:vm';import zlib from 'node:zlib';import assert from 'node:assert/strict';
const dist=new URL('./dist/',import.meta.url);
const elements={},el=id=>elements[id]||(elements[id]={id,value:'',checked:false,disabled:false,hidden:false,textContent:'',clicks:0,classList:{toggle(){}},focus(){c.document.activeElement=this},click(){this.clicks++},after(){},appendChild(){},addEventListener(){},querySelector:()=>el(id+'-option')});
const workers=[];class FakeWorker{constructor(url){this.url=url;this.sent=[];this.terminated=false;workers.push(this)}postMessage(m){this.sent.push(m)}terminate(){this.terminated=true}}
const toasts=[],statuses=[],builtin={name:'builtin'};let settingsLoads=0;
const c={console,Blob,Response,DecompressionStream,Uint8Array,ArrayBuffer,Error,Promise,Math,Number,String,Date,Set,Map,JSON,Object,Array,setTimeout:fn=>fn(),
  document:{readyState:'complete',activeElement:null,createElement:()=>({style:{},set innerHTML(v){},set textContent(v){}}),head:{appendChild(){}}},
  $:el,els:{},Worker:FakeWorker,self:{},exportBusy:false,AppState:{templateId:'etsyfolger-v1',mode:'sleeve'},designLayers:[[],[]],
  templateBase:builtin,builtinTemplateBase:builtin,builtinTemplateError:null,
  setActiveTemplateBase(b){c.templateBase=b},templateStatus(m){statuses.push(m)},toast(m){toasts.push(m)},projectStateToUI(){},scheduleRebuild(){},renderTemplateBlank(){},templateView(){},saveSettings(){},dirty(){},
  syncTemplateUI(){},templateInfo:()=>({}),templateJobData:()=>undefined,SleeveTemplate:{profile:b=>b},loadSettings(){settingsLoads++}};
vm.createContext(c);
vm.runInContext(fs.readFileSync(new URL('custom-template.js',dist),'utf8'),c);
vm.runInContext(fs.readFileSync(new URL('custom-template-ui.js',dist),'utf8')+'\n;globalThis.__ui={get customTemplate(){return customTemplate},get customLoading(){return customLoading},get pending(){return customActivatePending},useCustomTemplateBuffer,beforeTemplateChoice,restoreProjectTemplate,gunzipBytes,removeTemplate:()=>$("removeTemplateBtn").onclick()};',c);
const ui=c.__ui,flush=()=>new Promise(r=>setImmediate(r));
const ready=(w,name='part')=>{const m=w.sent[0];const base={positions:new Float32Array(9),indices:new Uint32Array([0,1,2]),height:40,bounds:{min:[0,0,0],max:[10,40,10]},orientation:{up:'auto',turn:0,units:'mm',autoAlign:true}};
  w.onmessage({data:{id:m.id,stage:'ready',source:{positions:new Float32Array(9),indices:new Uint32Array([0,1,2])},report:{closed:true,triangles:1,nonOrientable:0},base,display:null,preview:{stats:{outerVertices:1,thinVertices:0}}}})};
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};

await test('a newer upload cancels the older one; the older promise rejects with CANCELLED',async()=>{
  const first=ui.useCustomTemplateBuffer(new ArrayBuffer(8),'first',undefined,{quiet:true});const w1=workers.at(-1);assert(ui.customLoading);
  const second=ui.useCustomTemplateBuffer(new ArrayBuffer(8),'second',undefined,{quiet:true});const w2=workers.at(-1);
  await assert.rejects(first,e=>e.code==='CANCELLED');assert(w1.terminated);assert(ui.customLoading,'second is still loading');
  ready(w2);const t=await second;assert.equal(t.name,'second');assert.equal(ui.customLoading,false);assert.equal(c.AppState.templateId,'custom-stl');assert(w2.terminated);
});
await test('choosing another template while loading keeps that choice',async()=>{
  c.AppState.templateId='etsyfolger-v1';c.templateBase=builtin;const p=ui.useCustomTemplateBuffer(new ArrayBuffer(8),'late',undefined,{quiet:true});const w=workers.at(-1);
  assert(ui.beforeTemplateChoice('etsyfolger-v1'));assert.equal(ui.pending,false);ready(w);const t=await p;
  assert.equal(ui.customTemplate,t,'the template is loaded and listed');assert.equal(c.AppState.templateId,'etsyfolger-v1');assert.equal(c.templateBase,builtin);
});
await test('removing during preparation clears the loading state',async()=>{
  const p=ui.useCustomTemplateBuffer(new ArrayBuffer(8),'gone',undefined,{quiet:true});ui.removeTemplate();await assert.rejects(p,e=>e.code==='CANCELLED');
  assert.equal(ui.customLoading,false);assert.equal(ui.customTemplate,null);assert.equal(el('uploadTemplateBtn').disabled,false);
});
await test('empty Custom STL entry: hint and focus, never a file dialog',()=>{
  const clicks=el('templateStlInput').clicks;assert.equal(ui.beforeTemplateChoice('custom-stl'),false);assert.equal(el('templateStlInput').clicks,clicks);assert.equal(c.document.activeElement,el('uploadTemplateBtn'));assert.match(statuses.at(-1),/Upload an STL first/);
});
await test('worker crash and worker errors reject with readable messages',async()=>{
  let p=ui.useCustomTemplateBuffer(new ArrayBuffer(8),'crash',undefined,{quiet:true});let w=workers.at(-1);let prevented=false;w.onerror({message:'out of memory',preventDefault(){prevented=true}});
  await assert.rejects(p,/worker stopped: out of memory.*simplified STL/);assert(prevented);assert.equal(ui.customLoading,false);
  p=ui.useCustomTemplateBuffer(new ArrayBuffer(8),'bad',undefined,{quiet:true});w=workers.at(-1);w.onmessage({data:{id:w.sent[0].id,error:'The STL contains no triangles.'}});await assert.rejects(p,/no triangles/);assert.match(statuses.at(-1),/Could not use this STL: The STL contains no triangles/);
});
await test('decompression is capped',async()=>{
  const small=zlib.gzipSync(Buffer.from('hello'));assert.equal(Buffer.from(await ui.gunzipBytes(small)).toString(),'hello');
  await assert.rejects(ui.gunzipBytes(zlib.gzipSync(Buffer.alloc(2048)),1024),/larger than 100 MB/);
});
await test('project-open notices are returned for the Project opened toast',async()=>{
  const p={version:4,settings:{templateId:'custom-stl'},template:{kind:'custom-stl',name:'huge part',mesh:null,orientation:{up:'auto',turn:0,units:'mm',autoAlign:true}}};
  const notice=await ui.restoreProjectTemplate(p);assert.match(notice,/too large to embed/);assert.equal(p.settings.templateId,'etsyfolger-v1');
  assert.equal(await ui.restoreProjectTemplate({version:3,settings:{templateId:'etsyfolger-v1'}}),'');
});
await test('loadSettings (undo/redo, project open) keeps the displayed surface in step with templateId',async()=>{
  const p=ui.useCustomTemplateBuffer(new ArrayBuffer(8),'again',undefined,{quiet:true});ready(workers.at(-1));const t=await p;c.AppState.templateId='custom-stl';c.templateBase=builtin;const before=settingsLoads;c.loadSettings({});assert.equal(settingsLoads,before+1);assert.equal(c.templateBase,t.base);
  c.AppState.templateId='etsyfolger-v1';c.loadSettings({});assert.equal(c.templateBase,builtin);
});
console.log(passed+' custom template UI checks passed');
