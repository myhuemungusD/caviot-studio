// Design rotation controls: angles wrap instead of clamping, slider and number box agree, keyboard steps continue past
// ±180, and holding a slider defers the detailed rebuild until release.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const ui=fs.readFileSync(new URL('./dist/template-ui.js',import.meta.url),'utf8');
const els={},listeners={};const el=id=>els[id]||(els[id]={id,value:'',max:'',listeners:{},addEventListener(n,fn){this.listeners[n]=fn},dispatchEvent(e){this.listeners[e.type]?.({...e,target:this,preventDefault(){}})},appendChild(){}});
let placements=0,finishes=0;const state={designAngle:0,designY:44.5,designWidth:30,designHeight:30,designRotation:0};
const c={AppState:state,$:el,document:{createElement:()=>({})},templateBase:null,updatePlacement(){placements++},finishPlacement(){finishes++},Event:class{constructor(type){this.type=type}},Math,Number,String,Set,console};
vm.createContext(c);
const code=ui.slice(ui.indexOf('function placementLimit('),ui.indexOf('function setActiveTemplateBase'))+ui.slice(ui.indexOf('const placementSpecs='),ui.indexOf('function syncTemplateUI'));
vm.runInContext(code+';globalThis.wrapDegrees=wrapDegrees;globalThis.placementValue=placementValue;globalThis.syncPlacementLimits=syncPlacementLimits;',c);
const {wrapDegrees,placementValue}=c;
for(const [input,expected]of [[0,0],[180,180],[-180,-180],[181,-179],[200,-160],[-190,170],[360,0],[540,180],[-540,180],[725,5],[-91,-91]])assert.equal(wrapDegrees(input),expected,'wrap '+input);
assert.equal(placementValue('designRotation',12.5,-180,180),13,'rotation uses whole degrees');assert.equal(placementValue('designRotation',-0.4,-180,180),0);
assert.equal(placementValue('designAngle',190.5,-180,180),-169.5,'around-sleeve angle wraps and keeps decimals');
assert.equal(placementValue('designWidth',500,2,160),160,'sizes still clamp');assert.equal(placementValue('designHeight',1,2,89),2);
const type=(id,value,commit=true)=>{const n=el(id);n.value=String(value);n.dispatchEvent({type:'input'});if(commit)n.dispatchEvent({type:'change'})};
type('designRotationNumber','200');assert.equal(state.designRotation,-160);assert.equal(els.designRotationRange.value,'-160');assert.equal(els.designRotationNumber.value,'-160','commit shows the wrapped value');
type('designRotationNumber','-190');assert.equal(state.designRotation,170);assert.equal(els.designRotationNumber.value,'170');
type('designRotationNumber','12.5');assert.equal(state.designRotation,13);assert.equal(els.designRotationRange.value,'13');assert.equal(els.designRotationNumber.value,'13','slider and box agree');
type('designRotationNumber','181',true);assert.equal(state.designRotation,-179,'spinner step past 180 continues at -179');
type('designRotationNumber','',true);assert.equal(state.designRotation,-179,'an empty box keeps the value');assert.equal(els.designRotationNumber.value,'-179','and shows it again on commit');
type('designRotationNumber','-91');assert.equal(state.designRotation,-91);assert.equal(els.designRotationRange.value,'-91');
// Keyboard on the slider: ArrowRight at +180 continues at -179; ArrowLeft at -180 continues at 179.
const range=el('designRotationRange');range.value='180';let prevented=false;range.listeners.keydown({key:'ArrowRight',target:range,preventDefault(){prevented=true}});assert(prevented);assert.equal(state.designRotation,-179);assert.equal(els.designRotationNumber.value,'-179');
range.value='-180';range.listeners.keydown({key:'ArrowLeft',target:range,preventDefault(){}});assert.equal(state.designRotation,179);
range.value='90';prevented=false;range.listeners.keydown({key:'ArrowRight',target:range,preventDefault(){prevented=true}});assert(!prevented,'normal steps stay native');
// Width keeps clamping; angle number boxes carry no min/max so the spinner can pass the ends.
type('designWidthNumber','999');assert.equal(state.designWidth,160);c.syncPlacementLimits();assert.equal(els.designRotationNumber.max,'');assert.equal(els.designRotationRange.max,'180');assert.equal(els.designWidthNumber.max,'160');
console.log('Rotation wrap, precision and slider/number sync passed.');
// Placement: holding a slider shows the overlay but defers the detailed rebuild until release.
let builds=0,overlays=0,counter=0;const timers=new Map(),docEvents={},winEvents={};
const p={THREE:{Vector2:class{}},AppState:{image:{},rebuildTimer:null},templateActive:()=>true,renderTemplateBlank(){},templateRevision:0,templatePending:null,templatePreviewRunning:false,templatePreviewWorker:null,templateActivePointer:null,document:{body:{classList:{remove(){}}},addEventListener:(n,fn)=>docEvents[n]=fn},addEventListener:(n,fn)=>winEvents[n]=fn,templateStatus(m){p.status=m},saveSettings(){},requestTemplatePreview(){builds++},clearTimeout(id){timers.delete(id)},setTimeout(fn){const id=++counter;timers.set(id,fn);return id}};
p.globalThis=p;vm.createContext(p);vm.runInContext(fs.readFileSync(new URL('./dist/placement-preview.js',import.meta.url),'utf8'),p);p.showPlacementPreview=()=>overlays++;
const run=()=>{for(const [id,fn]of[...timers]){timers.delete(id);fn()}};
docEvents.pointerdown({target:{matches:s=>s==='input[type=range]'}});
for(let i=0;i<50;i++)p.updatePlacement();assert.equal(overlays,50);assert.equal(timers.size,0,'no rebuild timer while the thumb is held');assert.match(p.status,/release/);run();assert.equal(builds,0);
winEvents.pointerup();run();assert.equal(builds,1,'release starts exactly one rebuild');
docEvents.pointerdown({target:{matches:s=>s==='input[type=range]'}});p.updatePlacement();p.finishPlacement();winEvents.pointerup();run();assert.equal(builds,2,'a change event before pointerup does not build twice');
docEvents.pointerdown({target:{matches:()=>false}});p.updatePlacement();assert.equal(timers.size,1,'other pointers keep the pause timer');run();assert.equal(builds,3);
console.log('Slider drags defer the detailed rebuild to release.');
