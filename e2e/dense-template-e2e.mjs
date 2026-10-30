// A dense imported template (a can whose wall is long thin slivers, like CAD exports of drink cans) with a large logo
// and Sharp edges on, at phone size with phone-safe limits. This used to stop with the red "This template is too dense
// for Sharp edges with this artwork" error. Now the outlines adapt on their own: no error toast, a formed preview, and a
// valid STL export.
// usage: node dense-template-e2e.mjs <baseURL> [shotPrefix]
// needs: npm i playwright-core; Chrome at $CHROME (default /usr/bin/google-chrome).
import {chromium,devices} from 'playwright-core';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import zlib from 'node:zlib';
const base=(process.argv[2]||'http://127.0.0.1:4173/').replace(/\/?$/,'/');const shots=process.argv[3]||'';
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let failures=0,passes=0;const ok=(cond,msg)=>{if(cond){passes++;console.log('  PASS',msg)}else{failures++;console.log('  FAIL',msg)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function settle(p,ms=240000){const t=Date.now();await sleep(300);while(Date.now()-t<ms){if(await p.evaluate(()=>typeof templatePreviewRunning!=='undefined'&&!!templateBase&&!templatePreviewRunning&&!templatePending&&!placementTimer&&!AppState.rebuildTimer&&!exportBusy&&!customActivatePending))return true;await sleep(250)}return false}
// Closed can, 66 mm across and 120 mm tall: 3,000 segments around (0.07 mm) by 80 rows (1.5 mm), 486k triangles.
function sliverCanSTL(r=33,h=120,n=3000,rows=80){const count=n*(rows*2+2),buf=Buffer.alloc(84+count*50);buf.writeUInt32LE(count,80);let f=0;
  const P=(i,z)=>[r*Math.cos(i/n*2*Math.PI),r*Math.sin(i/n*2*Math.PI),z],put=tri=>{tri.flat().forEach((v,k)=>buf.writeFloatLE(v,84+f*50+12+k*4));f++};
  for(let i=0;i<n;i++){const j=i+1;for(let k=0;k<rows;k++){const z0=k*h/rows,z1=(k+1)*h/rows;put([P(i,z0),P(j,z0),P(j,z1)]);put([P(i,z0),P(j,z1),P(i,z1)])}put([[0,0,0],P(j,0),P(i,0)]);put([[0,0,h],P(i,h),P(j,h)])}return buf}
const STL=path.join(os.tmpdir(),'caviot-sliver-can.stl');fs.writeFileSync(STL,sliverCanSTL());
// Artwork with many outlines: the Design Mainline mask from test-fixtures, written as a black-on-white PNG.
function maskPNG(){const raw=zlib.gunzipSync(fs.readFileSync(new URL('../test-fixtures/bottom-logo-mask.f32.gz',import.meta.url))),m=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4),w=1024,h=m.length/w;
  const rows=Buffer.alloc((w+1)*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)rows[y*(w+1)+1+x]=m[y*w+x]>.5?0:255;
  const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]),crc=Buffer.alloc(4);crc.writeUInt32BE(zlib.crc32(td));return Buffer.concat([len,td,crc])};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])}
const IMAGE=path.join(os.tmpdir(),'caviot-dense-logo.png');fs.writeFileSync(IMAGE,maskPNG());
const ctx=await browser.newContext({...devices['iPhone 14'],acceptDownloads:true}),p=await ctx.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
// Every toast is recorded (they fade after 2.6 s).
await p.addInitScript(()=>{window.__toasts=[];addEventListener('DOMContentLoaded',()=>{const el=document.getElementById('toast')||document.querySelector('.toast');if(!el)return;new MutationObserver(()=>{if(el.classList.contains('show'))window.__toasts.push({text:el.textContent,error:el.classList.contains('error')})}).observe(el,{attributes:true,childList:true,characterData:true,subtree:true})})});
await p.goto(base+'?tier=light',{waitUntil:'load'});await p.waitForFunction(()=>typeof templateBase!=='undefined'&&!!templateBase,null,{timeout:120000});await settle(p);
ok(await p.evaluate(()=>CaviotDevice.tier==='light'&&AppState.crisp),'phone-safe limits with Sharp edges on');
await p.setInputFiles('#fileInput',IMAGE);await p.waitForFunction(()=>!!AppState.image,null,{timeout:30000});await settle(p);
const chooser=p.waitForEvent('filechooser');await p.evaluate(()=>openTemplateUpload());await (await chooser).setFiles(STL);
await p.waitForFunction(()=>AppState.templateId==='custom-stl'&&templateBase!==builtinTemplateBase&&!customActivatePending,null,{timeout:240000});
ok(await settle(p),'imported can settled');
// A large logo across the can (the size that failed before).
await p.evaluate(()=>{for(const [id,v] of [['designWidth',70],['designHeight',70],['designY',60]]){const el=$(id+'Number');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}});
ok(await settle(p),'preview with the large logo settled');
const state=()=>p.evaluate(()=>({valid:templatePreviewValid,status:$('templateStatus').textContent,width:AppState.designWidth,toasts:window.__toasts}));
const shown=await state();
ok(shown.width>=60,'logo is large ('+shown.width+' mm wide)');
ok(shown.valid&&/Designs follow the sleeve surface/.test(shown.status)&&/Clean contours/.test(shown.status),'sharp design formed on the dense template: '+shown.status);
if(shots)await p.screenshot({path:shots+'dense-preview.png',timeout:120000}).catch(e=>console.log('  (screenshot skipped: '+e.message.split('\n')[0]+')'));
const dl=p.waitForEvent('download',{timeout:400000}).catch(()=>null);await p.tap('#generateBtn');
// Phones may ask before a large export, and iOS shows a file-ready sheet; take the phone-safe path through both.
for(let t=Date.now();Date.now()-t<400000;){const s=await p.evaluate(()=>({heavy:$('heavyExportDialog')?.open,ready:$('fileReadyDialog')?.open,busy:exportBusy}));
  if(s.heavy){await p.evaluate(()=>document.querySelector('#heavyExportDialog [data-choice="safe"]').click());await sleep(300);continue}
  if(s.ready){await p.evaluate(()=>document.querySelector('#fileReadyDialog [data-act="download"]').click());break}
  if(!s.busy&&await p.evaluate(()=>/Exported|could not|failed|Mesh check/i.test($('templateStatus').textContent)))break;await sleep(500)}
const download=await dl;ok(!!download,'STL download delivered');
if(download){const buf=fs.readFileSync(await download.path()),tris=buf.readUInt32LE(80);ok(buf.length===84+tris*50&&tris>486000,'STL is valid: '+tris.toLocaleString()+' triangles')}
const done=await state();
ok(/Exported/.test(done.status)&&!/too dense|could not|failed/i.test(done.status),'export status: '+done.status);
ok(!done.toasts.some(t=>t.error||/too dense|could not be formed/i.test(t.text)),'no error toast'+(done.toasts.length?' (toasts: '+done.toasts.map(t=>t.text).join(' | ')+')':''));
ok(errors.length===0,'no page errors'+(errors.length?': '+errors.join(' | '):''));
await ctx.close();await browser.close();console.log(`\n${passes} passed, ${failures} failed`);process.exit(failures?1:0);
