// Importing an STL template while designs are on the sleeve: the new template must replace the displayed sleeve at
// once, keep the designs, and never leave the previous template's mesh on screen - also when the preview with the
// artwork fails on the new template (forced here by patching the preview worker), which used to keep showing
// ETSYFOLGER under a "custom template" header until the designs were removed.
// usage: node template-switch-e2e.mjs <baseURL> [shotPrefix]
// needs: npm i playwright-core; Chrome at $CHROME (default /usr/bin/google-chrome).
import {chromium} from 'playwright-core';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const base=(process.argv[2]||'http://127.0.0.1:4173/').replace(/\/?$/,'/');const shots=process.argv[3]||'';
const IMAGE=process.env.IMAGE||new URL('./fixtures/badge.png',import.meta.url).pathname;
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let failures=0,passes=0;const ok=(cond,msg)=>{if(cond){passes++;console.log('  PASS',msg)}else{failures++;console.log('  FAIL',msg)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function settle(p,ms=180000){const t=Date.now();await sleep(300);while(Date.now()-t<ms){if(await p.evaluate(()=>typeof templatePreviewRunning!=='undefined'&&!!templateBase&&!templatePreviewRunning&&!templatePending&&!placementTimer&&!AppState.rebuildTimer&&!exportBusy))return true;await sleep(250)}return false}
// A Z-up hollow tube 30 mm across and 50 mm tall with a 2 mm floor: clearly not ETSYFOLGER (89 mm tall).
function tubeSTL(ro=15,ri=13,h=50,n=96,bottom=2){const t=[],P=(r,i,z)=>[r*Math.cos(i/n*2*Math.PI),r*Math.sin(i/n*2*Math.PI),z];
  for(let i=0;i<n;i++){const j=i+1;t.push([P(ro,i,0),P(ro,j,0),P(ro,j,h)],[P(ro,i,0),P(ro,j,h),P(ro,i,h)],[P(ri,i,bottom),P(ri,j,h),P(ri,j,bottom)],[P(ri,i,bottom),P(ri,i,h),P(ri,j,h)],[P(ri,i,h),P(ro,i,h),P(ro,j,h)],[P(ri,i,h),P(ro,j,h),P(ri,j,h)],[[0,0,0],P(ro,j,0),P(ro,i,0)],[[0,0,bottom],P(ri,i,bottom),P(ri,j,bottom)])}
  const buf=Buffer.alloc(84+t.length*50);buf.writeUInt32LE(t.length,80);t.forEach((tri,f)=>tri.flat().forEach((v,k)=>buf.writeFloatLE(v,84+f*50+12+k*4)));return buf}
const STL=path.join(os.tmpdir(),'caviot-switch-tube.stl');fs.writeFileSync(STL,tubeSTL());
const shown=p=>p.evaluate(()=>{meshObj.geometry.computeBoundingBox();const b=meshObj.geometry.boundingBox;return{height:b.max.y,width:b.max.x-b.min.x,templateHeight:templateBase.height,custom:AppState.templateId==='custom-stl',designs:designLayers.flat().filter(s=>s.image).length,valid:templatePreviewValid,quality:$('statQuality').textContent,status:$('templateStatus').textContent,toast:[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' | ')}});
async function run(label,breakCustomPreview){
  console.log(label);const ctx=await browser.newContext({viewport:{width:1400,height:900}}),p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  if(breakCustomPreview)await p.route('**/template-worker.js',async route=>{const r=await route.fetch();const body=(await r.text()).replace("stage('Loading template');","if(data.type!=='export'&&data.template?.kind==='custom'){const e=Error('forced');e.code='MESH_BUDGET';throw e}stage('Loading template');");await route.fulfill({response:r,body})});
  await p.goto(base,{waitUntil:'load'});await p.waitForFunction(()=>typeof templateBase!=='undefined'&&!!templateBase,null,{timeout:120000});await settle(p);
  await p.setInputFiles('#fileInput',IMAGE);await p.waitForFunction(()=>!!AppState.image,null,{timeout:30000});ok(await settle(p),'design formed on ETSYFOLGER');
  const before=await shown(p);ok(!before.custom&&Math.abs(before.height-89)<.5,'ETSYFOLGER shown with the design ('+before.height.toFixed(1)+' mm tall)');
  const chooser=p.waitForEvent('filechooser');await p.click('#openSTL');await (await chooser).setFiles(STL);
  await p.waitForFunction(()=>AppState.templateId==='custom-stl'&&templateBase!==builtinTemplateBase&&!customActivatePending,null,{timeout:120000});
  // Immediately after the import (before the preview with the artwork returns) the tube is on screen.
  const early=await shown(p);ok(early.custom&&Math.abs(early.height-50)<.5,'imported template shown at once ('+early.height.toFixed(1)+' mm tall, template '+early.templateHeight.toFixed(1)+' mm)');
  ok(await settle(p),'preview settled');const after=await shown(p);
  ok(after.custom&&Math.abs(after.height-50)<.5&&after.width<31,'imported template still shown after the preview ('+after.height.toFixed(1)+' mm tall, '+after.width.toFixed(1)+' mm wide)');
  ok(after.designs===1,'the design is kept');
  if(breakCustomPreview){ok(!after.valid&&after.quality==='Check placement','failed preview reported (Check placement)');ok(/too dense/.test(after.status),'reason in the template status: '+after.status);ok(/template is loaded, but your design could not be formed/.test(after.toast),'toast explains the missing design');}
  else ok(after.valid&&/Designs follow the sleeve surface/.test(after.status),'design formed on the imported template');
  if(shots)await p.screenshot({path:shots+(breakCustomPreview?'failed-preview':'imported')+'.png'});
  ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));await ctx.close();
}
await run('Import while a design is placed',false);
await run('Import while a design is placed, preview fails on the new template',true);
await browser.close();console.log(`\n${passes} passed, ${failures} failed`);process.exit(failures?1:0);
