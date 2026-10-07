// Phone redesign phase 1, end to end with device emulation and real touch input (Chromium + CDP touch events):
// autosave/restore, the Add-logo start card, the reordered tools sheet, background picking, one Front/Back control,
// proportional size with pinch/twist on the logo, custom STL memory guards, and Share-first export.
// usage: node mobile-phase1-e2e.mjs <baseURL> [deviceNames,comma,separated] [shotPrefix]
// needs: npm i playwright-core; Chrome at $CHROME (default /usr/bin/google-chrome).
import {chromium,devices} from 'playwright-core';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const base=(process.argv[2]||'http://127.0.0.1:4173/').replace(/\/?$/,'/');
const names=(process.argv[3]||'iPhone 14,iPhone SE,Pixel 7,iPad (gen 7)').split(',');
const shots=process.argv[4]||'';const IMAGE=new URL('./fixtures/badge.png',import.meta.url).pathname;
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let failures=0,passes=0;const ok=(cond,msg)=>{if(cond){passes++;console.log('  PASS',msg)}else{failures++;console.log('  FAIL',msg)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function settle(p,ms=90000){const t=Date.now();await sleep(300);while(Date.now()-t<ms){if(await p.evaluate(()=>typeof templatePreviewRunning!=='undefined'&&!!templateBase&&!templatePreviewRunning&&!templatePending&&!placementTimer&&!AppState.rebuildTimer&&!exportBusy))return true;await sleep(250)}return false}
const touch=async(cdp,type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id,radiusX:4,radiusY:4,force:1}))});
async function tap(cdp,pt){await touch(cdp,'touchStart',[pt]);await sleep(40);await touch(cdp,'touchEnd',[]);}
// Waits until the tools sheet stops scrolling (smooth scrolls are slow under software GL).
async function scrollStill(p){let last=-1,same=0;for(let i=0;i<40&&same<3;i++){await sleep(250);const t=await p.evaluate(()=>document.querySelector('.sidebar').scrollTop);same=t===last?same+1:0;last=t}}
// Taps the centre of an element like a finger would. Inside the sheet it first scrolls the element into the part
// below the sticky header and rail; it refuses to tap if something else still covers it.
async function tapEl(p,cdp,sel){await scrollStill(p);
  await p.evaluate(s=>{const e=document.querySelector(s),sb=e.closest('.sidebar');if(!sb)return;if(e.closest('#phoneRail')){e.scrollIntoView({inline:'center',block:'nearest'});return}const r=e.getBoundingClientRect(),box=sb.getBoundingClientRect(),rail=document.getElementById('phoneRail'),head=sb.querySelector('.sheet-handle');
    const top=Math.max(box.top,rail&&rail.offsetParent?rail.getBoundingClientRect().bottom:0,head&&head.offsetParent?head.getBoundingClientRect().bottom:0),bottom=Math.min(box.bottom,innerHeight);
    if(r.top<top+4||r.bottom>bottom-4)sb.scrollTop+=r.top+r.height/2-(top+bottom)/2},sel);await sleep(250);
  const pt=await p.evaluate(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return document.elementFromPoint(x,y)?.closest(s)===e?[x,y]:null},sel);
  if(!pt){console.log('    (covered: '+sel+' by '+await p.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return JSON.stringify([Math.round(r.y),Math.round(r.height)])+' '+(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML||'').slice(0,90)},sel)+')');return false}
  await tap(cdp,pt);return pt}
// Two fingers around c: distance from 2*d0 to 2*d1 and turned by deg degrees.
async function twoFinger(cdp,c,d0,d1,deg=0,steps=14){const pts=(d,a)=>[[c[0]-Math.cos(a)*d,c[1]-Math.sin(a)*d],[c[0]+Math.cos(a)*d,c[1]+Math.sin(a)*d]];
  await touch(cdp,'touchStart',[pts(d0,0)[0]]);await sleep(10);await touch(cdp,'touchStart',pts(d0,0));
  for(let i=1;i<=steps;i++){await touch(cdp,'touchMove',pts(d0+(d1-d0)*i/steps,deg*Math.PI/180*i/steps));await sleep(20)}await sleep(60);await touch(cdp,'touchEnd',[]);}
const camDist=p=>p.evaluate(()=>+camera.position.distanceTo(controls.target).toFixed(3));
const designPoint=p=>p.evaluate(()=>{const t=(AppState.designAngle+90)*Math.PI/180,R=30,v=new THREE.Vector3(Math.cos(t)*R,AppState.designY,Math.sin(t)*R).project(camera),r=renderer.domElement.getBoundingClientRect();const c=[r.left+(v.x+1)/2*r.width,r.top+(1-v.y)/2*r.height];
 for(let ring=0;ring<30;ring++)for(let a=0;a<Math.max(1,ring*6);a++){const ang=a/Math.max(1,ring*6)*Math.PI*2,x=c[0]+Math.cos(ang)*ring*8,y=c[1]+Math.sin(ang)*ring*8;if(document.elementFromPoint(x,y)===renderer.domElement&&touchHitsSelectedDesign({clientX:x,clientY:y}))return [x,y];}return null});
const record=p=>p.evaluate(()=>new Promise(res=>{const r=indexedDB.open('caviot.autosave.v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('designs');r.onsuccess=()=>{const db=r.result;const g=db.transaction('designs').objectStore('designs').get('current');g.onsuccess=()=>{db.close();const v=g.result;res(v?{savedAt:v.savedAt,layers:v.layers,custom:v.custom,bytes:v.json.length,name:v.name}:null)};g.onerror=()=>{db.close();res('error')}};r.onerror=()=>res('error')}));
const ageRecord=(p,ms)=>p.evaluate(ms=>new Promise(res=>{const r=indexedDB.open('caviot.autosave.v1',1);r.onsuccess=()=>{const db=r.result,s=db.transaction('designs','readwrite').objectStore('designs');const g=s.get('current');g.onsuccess=()=>{const v=g.result;v.savedAt=Date.now()-ms;s.put(v,'current').onsuccess=()=>{db.close();res(true)}}}}),ms);
async function boot(p){await p.waitForFunction(()=>typeof templateBase!=='undefined'&&!!templateBase&&(typeof CaviotAutosave==='undefined'||!CaviotAutosave.enabled||CaviotAutosave.ready),null,{timeout:90000});await settle(p);}
async function addLogoViaPicker(p,cdp,which='photos',root='#phoneStart'){const chooser=p.waitForEvent('filechooser',{timeout:10000});if(process.env.DEBUG)console.log('    (picker: '+await p.evaluate(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return JSON.stringify({hidden:e.closest('[hidden]')?.id||'',x:r.x,y:r.y,at:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,60),open:settingsAreOpen()})},root+' [data-add="'+which+'"]')+')');await tapEl(p,cdp,root+' [data-add="'+which+'"]');const fc=await chooser;const id=await fc.element().evaluate(e=>e.id+'|'+(e.getAttribute('capture')||''));await fc.setFiles(IMAGE);await p.waitForFunction(()=>!!AppState.image,null,{timeout:30000});await settle(p);return id}
const sheetOpen=p=>p.evaluate(()=>settingsAreOpen());
// Software GL keeps the main thread busy, so the sheet's 220 ms slide can take a second here: wait for it to finish.
const sheetStill=(p,open)=>p.waitForFunction(o=>{const s=getComputedStyle(document.querySelector('.sidebar'));return settingsAreOpen()===o&&(o?s.transform==='none':s.visibility==='hidden')},open,{timeout:15000}).catch(()=>{});
async function railTo(p,cdp,id){await tapEl(p,cdp,'.phone-rail-btn[data-target="'+id+'"]');await scrollStill(p)}
async function openSheet(p,cdp){if(!(await sheetOpen(p)))await tapEl(p,cdp,'#mobileSettingsBtn');await sheetStill(p,true);await sleep(150)}
async function closeSheet(p,cdp){if(await sheetOpen(p))await tapEl(p,cdp,'.sheet-done');await sheetStill(p,false);await sleep(150)}
// A binary STL whose header claims n triangles (file padded to the matching size; never parsed when refused).
function fakeStl(n){const f=path.join(os.tmpdir(),'caviot-p1-'+n+'.stl');if(!fs.existsSync(f)){const h=Buffer.alloc(84);h.writeUInt32LE(n,80);fs.writeFileSync(f,h);fs.truncateSync(f,84+n*50)}return f}
// A real closed tube (outer and inner wall, top and bottom rings): 4*S*R + 4*S triangles.
function tubeStl(S,R){const f=path.join(os.tmpdir(),`caviot-p1-tube-${S}x${R}.stl`);if(fs.existsSync(f))return f;const n=4*S*R+4*S,b=Buffer.alloc(84+n*50);b.writeUInt32LE(n,80);let o=84;
  const P=(r,i,j)=>{const a=i%S/S*Math.PI*2;return [r*Math.cos(a),r*Math.sin(a),45*j/R]};const tri=(a,b2,c)=>{o+=12;for(const v of [a,b2,c])for(const x of v){b.writeFloatLE(x,o);o+=4}o+=2};
  for(let i=0;i<S;i++){for(let j=0;j<R;j++){const [a,b2,c,d]=[P(13,i,j),P(13,i+1,j),P(13,i+1,j+1),P(13,i,j+1)];tri(a,b2,c);tri(a,c,d);const [e,f2,g,h]=[P(11.6,i,j),P(11.6,i+1,j),P(11.6,i+1,j+1),P(11.6,i,j+1)];tri(e,g,f2);tri(e,h,g)}
    tri(P(13,i,0),P(11.6,i+1,0),P(13,i+1,0));tri(P(13,i,0),P(11.6,i,0),P(11.6,i+1,0));tri(P(13,i,R),P(13,i+1,R),P(11.6,i+1,R));tri(P(13,i,R),P(11.6,i+1,R),P(11.6,i,R))}
  fs.writeFileSync(f,b);return f}

for(const name of names){
  const dev={...devices[name]},isIPad=/iPad/.test(name),shareStub=/iPhone 14|Pixel/.test(name);
  console.log('==',name,JSON.stringify(dev.viewport),shareStub?'(share available)':'');const shot=shots&&(shots+name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')+'-');
  const ctx=await browser.newContext({...dev,acceptDownloads:true});
  await ctx.addInitScript(()=>{addEventListener('click',e=>{window.__clicks=(window.__clicks||[]).slice(-4).concat((e.target.id||e.target.className||e.target.tagName)+'@'+Math.round(e.clientY))},true)});
  if(shareStub)await ctx.addInitScript(()=>{navigator.canShare=()=>true;navigator.share=async d=>{window.__shared={name:d.files[0].name,size:d.files[0].size}}});
  let p=await ctx.newPage();const errors=[];const watch=pg=>{pg.on('pageerror',e=>errors.push('pageerror: '+e.message));pg.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});pg.on('dialog',d=>d.accept())};watch(p);
  let cdp=await ctx.newCDPSession(p);
  await p.goto(base,{waitUntil:'load'});await boot(p);
  const phone=await p.evaluate(()=>CaviotDevice.phoneLayout());
  if(!phone){
    // Tablet: the phone UI stays off and the existing touch behaviour is unchanged.
    const t=await p.evaluate(()=>({ui:document.body.classList.contains('phone-ui'),start:!document.getElementById('phoneStart').hidden,autosave:CaviotAutosave.enabled,rail:getComputedStyle(document.querySelector('.tool-rail')).display,lock:getComputedStyle(document.getElementById('lockAspect')).display,dbs:null}));
    ok(!t.ui&&!t.start&&!t.autosave&&t.rail!=='none'&&t.lock==='none','tablet keeps the existing layout (no phone UI, no autosave, icon rail) '+JSON.stringify(t));
    ok(!(await p.evaluate(async()=>(await indexedDB.databases()).some(d=>d.name==='caviot.autosave.v1'))),'tablet: no autosave database created');
    await p.setInputFiles('#fileInput',IMAGE);await p.waitForFunction(()=>!!AppState.image);await settle(p);
    if(await p.evaluate(()=>settingsAreOpen()&&innerWidth<=900)){await p.tap('#mobileSettingsBtn');await sleep(400)}
    await p.evaluate(()=>templateView('front'));await sleep(500);const pt=await designPoint(p);const d0=await camDist(p),w0=await p.evaluate(()=>AppState.designWidth);
    await twoFinger(cdp,pt,15,55);await sleep(600);
    ok((await camDist(p))<d0-1&&Math.abs((await p.evaluate(()=>AppState.designWidth))-w0)<1e-9,'tablet: pinch over the design still zooms the camera');
    await p.click('[data-template-view="back"]');await sleep(300);
    ok(await p.evaluate(()=>activeDesignSide===0&&camera.position.z<controls.target.z),'tablet: toolbar Back only turns the camera (unchanged)');
    const real=errors.filter(e=>!/willReadFrequently/.test(e));ok(!real.length,'no console/page errors '+JSON.stringify(real.slice(0,5)));await ctx.close();continue;
  }
  const vp=await p.evaluate(()=>({w:innerWidth,h:innerHeight}));
  // ---------- 2. Empty sleeve: Add-logo start card, guided export ----------
  const empty=await p.evaluate(()=>{const s=$('phoneStart'),r=s.getBoundingClientRect();return {shown:!s.hidden&&getComputedStyle(s).display!=='none',buttons:[...s.querySelectorAll('[data-add]')].map(b=>b.lastChild.textContent.trim()),minH:Math.min(...[...s.querySelectorAll('[data-add]')].map(b=>b.getBoundingClientRect().height)),bottom:r.bottom,bar:document.querySelector('.topbar').getBoundingClientRect().top,ghost:els.generateBtn.classList.contains('phone-export-empty')}});
  ok(empty.shown&&empty.buttons.join()==='Photos,Camera,Files,Text','empty sleeve shows "Add the customer\u2019s logo" with Photos/Camera/Files/Text');
  ok(empty.minH>=44&&empty.bottom<=empty.bar+1,'start card buttons are finger-sized and above the bottom bar '+JSON.stringify(empty));
  ok(empty.ghost,'Export STL is de-emphasised while the sleeve is empty');
  if(shot)await p.screenshot({path:shot+'empty.png'});
  await tapEl(p,cdp,'#generateBtn');await sleep(400);
  ok(await p.evaluate(()=>$('phoneEmptyExport').open&&!exportBusy),'Export with no logo asks first (no export started)');
  if(shot)await p.screenshot({path:shot+'empty-export.png'});
  await tapEl(p,cdp,'#phoneEmptyExport [data-choice="cancel"]');await sleep(300);ok(await p.evaluate(()=>!$('phoneEmptyExport').open&&!exportBusy),'Cancel closes it');
  await tapEl(p,cdp,'#generateBtn');await sleep(300);await tapEl(p,cdp,'#phoneEmptyExport [data-choice="add"]');await sleep(300);
  ok(await p.evaluate(()=>!$('phoneEmptyExport').open&&!$('phoneStart').hidden&&!exportBusy),'"Add logo" goes back to the start card');
  await tapEl(p,cdp,'#phoneStart [data-add="text"]');await sheetStill(p,true);
  ok(await p.evaluate(()=>settingsAreOpen()&&document.activeElement===els.textInput&&!!els.textInput.closest('#phoneSecAdd')),'Text opens the sheet with the text box focused');
  await closeSheet(p,cdp);
  if(/Pixel/.test(name)){const c=await p.evaluate(()=>{const f=$('phoneCameraInput'),g=$('phoneFilesInput');return {cap:f.getAttribute('capture'),acc:f.accept,files:g.accept}});ok(c.cap==='environment'&&c.acc==='image/*'&&/\.png/.test(c.files),'Camera asks for the rear camera; Files lists image types '+JSON.stringify(c))}
  const picker=await addLogoViaPicker(p,cdp,/SE/.test(name)?'files':/Pixel/.test(name)?'camera':'photos');
  ok(/^(fileInput|phoneFilesInput|phoneCameraInput)\|/.test(picker),'logo added from the start card ('+picker+')');
  ok(await p.evaluate(()=>!settingsAreOpen()&&$('phoneStart').hidden&&!els.generateBtn.classList.contains('phone-export-empty')),'after adding: sheet closed, start card gone, Export is the main action');
  if(shot)await p.screenshot({path:shot+'logo.png'});
  // ---------- 3. Tools sheet: order, labels, no contradictory numbers, shorter, logo stays visible ----------
  await openSheet(p,cdp);await sleep(400);await settle(p);
  const sheet=await p.evaluate(()=>{const sb=document.querySelector('.sidebar'),r=sb.getBoundingClientRect(),vis=e=>!!e&&e.offsetParent!==null&&getComputedStyle(e).visibility!=='hidden';
    const ids=[...sb.querySelectorAll('.phone-section')].map(s=>s.id);const rail=[...document.querySelectorAll('#phoneRail .phone-rail-btn')].map(b=>({t:b.textContent.replace(/^\W+/u,'').trim(),h:b.getBoundingClientRect().height,label:b.title}));
    const numbered=[...sb.querySelectorAll('.panel-label')].filter(l=>/^\s*\d+\s*\//.test(l.textContent)).map(l=>l.textContent);
    const tiny=[...sb.querySelectorAll('.phone-section:not(.phone-all) *')].filter(e=>vis(e)&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<12).map(e=>e.tagName+'.'+e.className+':'+e.textContent.trim().slice(0,20));
    return {ids,rail,numbered,tiny,top:r.top,height:r.height,vh:innerHeight,oldRail:vis(document.querySelector('.tool-rail')),fontFolder:vis($('openFontFolder')),upload:vis($('uploadBtn')),silhouette:vis($('silhouette')?.closest('label')),left:vis(document.querySelector('[data-template-view="left"]'))}});
  ok(sheet.ids.join()==='phoneSecAdd,phoneSecClean,phoneSecSize,phoneSecFinish,phoneSecSides,phoneAllSettings','sections in working order: add, background, size, emboss, front/back, all settings');
  ok(sheet.rail.map(r=>r.t).join()==='Add,Background,Size,Emboss,Front/back,All'&&sheet.rail.every(r=>r.h>=44&&r.label),'labelled tool buttons '+sheet.rail.map(r=>r.t).join(' / '));
  ok(!sheet.numbered.length,'no contradictory section numbers '+JSON.stringify(sheet.numbered));
  ok(!sheet.oldRail&&!sheet.fontFolder&&!sheet.upload&&!sheet.silhouette&&!sheet.left,'icon rail, Import font folder, the old upload box, Trim flat plate and Left/Right are hidden');
  ok(sheet.height<=sheet.vh*.5+1,'drawer opens at under half the screen ('+Math.round(sheet.height)+' of '+sheet.vh+'px)');
  ok(!sheet.tiny.length,'phone sections use text of 12px or larger '+JSON.stringify(sheet.tiny.slice(0,4)));
  const visible=await designPoint(p);ok(!!visible&&visible[1]<sheet.top-4,'logo stays visible above the open sheet '+JSON.stringify(visible));
  if(shot)await p.screenshot({path:shot+'drawer.png'});
  // ---------- 4. Background colour: tap Pick, then the preview ----------
  await railTo(p,cdp,'phoneSecClean');
  ok(await p.evaluate(()=>{const c=els.heightmapCanvas,r=c.getBoundingClientRect();return !!c.closest('#phoneSecClean')&&r.width>40&&r.height>40}),'flat preview shown under Remove background');
  await tapEl(p,cdp,'#bgPick');await sleep(300);
  ok(await p.evaluate(()=>AppState.pickingBg&&$('bgPick').getAttribute('aria-pressed')==='true'&&document.body.classList.contains('phone-picking')),'Pick turns pick mode on (button pressed, preview highlighted) '+await p.evaluate(()=>JSON.stringify({clicks:window.__clicks,on:AppState.pickingBg,y:Math.round($('bgPick').getBoundingClientRect().y)})));
  if(shot)await p.screenshot({path:shot+'pick.png'});
  await tapEl(p,cdp,'#bgPick');await sleep(200);ok(await p.evaluate(()=>!AppState.pickingBg&&$('bgPick').getAttribute('aria-pressed')==='false'),'tapping Pick again cancels');
  await tapEl(p,cdp,'#bgPick');await sleep(200);
  const target=await tapEl(p,cdp,'#heightmapCanvas');await sleep(400);
  const expect=target&&await p.evaluate(([x,y])=>{const c=els.heightmapCanvas,r=c.getBoundingClientRect(),px=Math.floor((x-r.left)/r.width*c.width),py=Math.floor((y-r.top)/r.height*c.height),s=document.createElement('canvas');s.width=AppState.image.width;s.height=AppState.image.height;const g=s.getContext('2d');g.drawImage(AppState.image,0,0);return [...g.getImageData(Math.floor(px/c.width*s.width),Math.floor(py/c.height*s.height),1,1).data].slice(0,3)},target);
  const picked=await p.evaluate(()=>({rgb:[AppState.bgR,AppState.bgG,AppState.bgB],on:AppState.pickingBg,pressed:$('bgPick').getAttribute('aria-pressed'),cls:document.body.classList.contains('phone-picking')}));
  ok(JSON.stringify(picked.rgb)===JSON.stringify(expect)&&!picked.on&&picked.pressed==='false'&&!picked.cls,'tapping the preview picks that colour and ends pick mode '+JSON.stringify(picked));
  await tapEl(p,cdp,'#bgPick');await sleep(200);await closeSheet(p,cdp);
  ok(await p.evaluate(()=>!AppState.pickingBg&&!document.body.classList.contains('phone-picking')),'closing the sheet ends pick mode');
  await settle(p);
  // ---------- 5. One Front/Back control ----------
  await tapEl(p,cdp,'.template-toolbar [data-template-view="back"]');await sleep(500);
  let side=await p.evaluate(()=>({side:activeDesignSide,cam:camera.position.z<controls.target.z,pressed:document.querySelector('[data-template-view="back"]').getAttribute('aria-pressed'),sheetBtn:$('editSide1').getAttribute('aria-pressed'),label:document.querySelector('[data-template-view="front"]').textContent}));
  ok(side.side===1&&side.cam&&side.pressed==='true'&&side.sheetBtn==='true','toolbar Back selects the back side and turns the camera '+JSON.stringify(side));
  ok(side.label==='Front · 1','toolbar shows how many designs each side has ('+side.label+')');
  await openSheet(p,cdp);await tapEl(p,cdp,'#editSide0');await sleep(500);
  side=await p.evaluate(()=>({side:activeDesignSide,cam:camera.position.z>controls.target.z,pressed:document.querySelector('[data-template-view="front"]').getAttribute('aria-pressed')}));
  ok(side.side===0&&side.cam&&side.pressed==='true','sheet Front button keeps the toolbar in step '+JSON.stringify(side));
  // ---------- 6. Proportional size, pinch to resize, twist to rotate ----------
  await railTo(p,cdp,'phoneSecSize');
  const lock0=await p.evaluate(()=>({pressed:$('lockAspect').getAttribute('aria-pressed'),w:AppState.designWidth,h:AppState.designHeight}));
  ok(lock0.pressed==='true','proportions locked by default');
  await p.fill('#designWidthNumber',String(Math.round(lock0.w*0.8)));await sleep(400);
  const lock1=await p.evaluate(()=>({w:AppState.designWidth,h:AppState.designHeight,hn:+$('designHeightNumber').value}));
  ok(Math.abs(lock1.w/lock1.h-lock0.w/lock0.h)<.02&&Math.abs(lock1.hn-lock1.h)<.01,'locked: changing width scales height ('+lock0.w+'×'+lock0.h+' → '+lock1.w+'×'+lock1.h+')');
  await tapEl(p,cdp,'#lockAspect');await p.fill('#designWidthNumber',String(Math.round(lock1.w*1.2)));await sleep(400);
  const lock2=await p.evaluate(()=>({w:AppState.designWidth,h:AppState.designHeight,pressed:$('lockAspect').getAttribute('aria-pressed')}));
  ok(lock2.pressed==='false'&&Math.abs(lock2.h-lock1.h)<.01&&Math.abs(lock2.w-Math.round(lock1.w*1.2))<.01,'unlocked: width changes alone '+JSON.stringify({lock1,lock2}));
  await tapEl(p,cdp,'#lockAspect');await closeSheet(p,cdp);await settle(p);
  await p.evaluate(()=>templateView('front'));await sleep(500);let pt=await designPoint(p);ok(!!pt,'selected design found on screen');
  if(pt){const d0=await camDist(p),s0=await p.evaluate(()=>({w:AppState.designWidth,h:AppState.designHeight,r:AppState.designRotation}));
    await twoFinger(cdp,pt,20,42);await settle(p);
    const s1=await p.evaluate(()=>({w:AppState.designWidth,h:AppState.designHeight,r:AppState.designRotation,ctl:controls.enabled}));const d1=await camDist(p);
    ok(s1.w>s0.w*1.3&&Math.abs(s1.w/s1.h-s0.w/s0.h)<.02&&d1===d0,'pinch on the logo resizes it, keeps proportions, camera still '+JSON.stringify({s0,s1,d0,d1}));
    ok(s1.r===s0.r&&s1.ctl,'pinch did not rotate; orbit re-enabled');
    pt=await designPoint(p);await twoFinger(cdp,pt,40,40,50);await settle(p);
    const s2=await p.evaluate(()=>({w:AppState.designWidth,r:AppState.designRotation}));
    ok(Math.abs(s2.r-s1.r)>=25&&Math.abs(s2.w-s1.w)<.01&&(await camDist(p))===d0,'twist on the logo rotates it (size and camera unchanged) '+JSON.stringify({from:s1.r,to:s2.r}));
    await p.evaluate(()=>{AppState.designRotation=0;showPlacementValue('designRotation');updatePlacement();finishPlacement()});await settle(p);
    const off=await p.evaluate(()=>{const r=renderer.domElement.getBoundingClientRect();for(const [fx,fy] of [[.18,.25],[.82,.25],[.18,.8],[.82,.8]]){const x=r.left+r.width*fx,y=r.top+r.height*fy;let near=false;for(const [dx,dy] of [[0,0],[60,0],[-60,0],[0,40],[0,-40]])if(touchHitsSelectedDesign({clientX:x+dx,clientY:y+dy}))near=true;if(!near)return [x,y]}return null});
    const w3=await p.evaluate(()=>AppState.designWidth);await twoFinger(cdp,off,20,50);await sleep(700);
    ok((await camDist(p))<d0-1&&(await p.evaluate(()=>AppState.designWidth))===w3,'pinch away from the logo zooms the camera as before');}
  // ---------- 1. Autosave and restore ----------
  await settle(p);const want=await p.evaluate(()=>({w:AppState.designWidth,h:AppState.designHeight,bg:[AppState.bgR,AppState.bgG,AppState.bgB]}));
  let rec=null;for(let i=0;i<24&&!(rec=await record(p));i++)await sleep(500);
  ok(!!rec&&rec.layers===1&&rec.custom===null&&rec.bytes<30*1048576,'design autosaved on the phone by itself '+JSON.stringify(rec));
  await p.evaluate(()=>CaviotAutosave.flush());
  await p.reload({waitUntil:'load'});await boot(p);
  let got=await p.evaluate(()=>({img:!!AppState.image,w:AppState.designWidth,h:AppState.designHeight,bg:[AppState.bgR,AppState.bgG,AppState.bgB],banner:!$('phoneBanner').hidden&&$('phoneBanner').textContent,tpl:AppState.templateId}));
  ok(got.img&&Math.abs(got.w-want.w)<.01&&Math.abs(got.h-want.h)<.01&&JSON.stringify(got.bg)===JSON.stringify(want.bg)&&got.tpl==='etsyfolger-v1','reload brings the design back (artwork, size, background colour) '+JSON.stringify(got).slice(0,160));
  ok(/Restored/.test(got.banner||''),'"Restored" banner with Start new');
  if(shot)await p.screenshot({path:shot+'restored.png'});
  await p.close();p=await ctx.newPage();watch(p);cdp=await ctx.newCDPSession(p);await p.goto(base,{waitUntil:'load'});await boot(p);
  ok(await p.evaluate(()=>!!AppState.image),'closing the tab and opening the studio again restores it too');
  await ageRecord(p,13*3600e3);await p.reload({waitUntil:'load'});await boot(p);
  got=await p.evaluate(()=>({img:!!AppState.image,start:!$('phoneStart').hidden,resume:!!$('phoneResume')&&$('phoneResume').offsetParent!==null}));
  ok(!got.img&&got.start&&got.resume,'an older autosave (13 h) is offered on the start card, not forced '+JSON.stringify(got));
  if(shot)await p.screenshot({path:shot+'resume.png'});
  await tapEl(p,cdp,'#phoneResume');await p.waitForFunction(()=>!!AppState.image,null,{timeout:30000}).catch(()=>{});await settle(p);
  ok(await p.evaluate(()=>!!AppState.image&&$('phoneStart').hidden),'Resume restores it');
  await ageRecord(p,13*3600e3);await p.reload({waitUntil:'load'});await boot(p);await tapEl(p,cdp,'#phoneDiscard');await sleep(500);
  ok((await record(p))===null&&await p.evaluate(()=>!AppState.image&&$('phoneStartExtra').hidden),'Discard deletes the saved design');
  await addLogoViaPicker(p,cdp);await p.evaluate(()=>CaviotAutosave.flush());ok(!!(await record(p)),'new design saved');
  await p.evaluate(()=>{CaviotAutosave.LIMITS.maxBytes=1000;AppState.designRotation=5;dirty()});await p.evaluate(()=>CaviotAutosave.flush());await sleep(300);
  ok((await record(p))===null&&await p.evaluate(()=>/too large/i.test(document.querySelector('.toast')?.textContent||'')),'a design over the size cap is not kept (and the older copy is removed), with a message');
  await p.evaluate(()=>{CaviotAutosave.LIMITS.maxBytes=30*1024*1024;AppState.designRotation=0;dirty()});await p.evaluate(()=>CaviotAutosave.flush());ok(!!(await record(p)),'saving resumes under the cap');
  await tapEl(p,cdp,'#mobileMoreBtn');await sleep(250);
  ok(await p.evaluate(()=>[...$('mobileMenu').querySelectorAll('button')][0].textContent==='Start new design…'),'overflow menu starts with "Start new design…"');
  const nav=p.waitForNavigation({waitUntil:'load'});await tapEl(p,cdp,'#mobileMenu [data-target="startNewDesign"]');await nav;await boot(p);
  ok((await record(p))===null&&await p.evaluate(()=>!AppState.image&&!$('phoneStart').hidden&&AppState.templateId==='etsyfolger-v1'&&bottomBrand.enabled),'Start new design: clean ETSYFOLGER with the DM bottom logo, saved design deleted');
  // ---------- 7. Custom STL memory guards ----------
  await p.setInputFiles('#templateStlInput',fakeStl(1600000));await sleep(500);
  let dlg=await p.evaluate(()=>({open:$('phoneStlDialog').open,title:$('phoneStlTitle').textContent,go:!$('phoneStlDialog').querySelector('[data-choice="go"]').hidden,text:$('phoneStlText').textContent}));
  ok(dlg.open&&/Too large/.test(dlg.title)&&!dlg.go&&/computer/.test(dlg.text),'1.6M-triangle STL is refused before loading, suggests a computer');
  if(shot)await p.screenshot({path:shot+'stl-block.png'});
  await tapEl(p,cdp,'#phoneStlDialog [data-choice="cancel"]');await sleep(300);ok(await p.evaluate(()=>AppState.templateId==='etsyfolger-v1'&&!customLoading),'nothing loaded');
  await p.setInputFiles('#templateStlInput',fakeStl(700000));await sleep(500);
  dlg=await p.evaluate(()=>({open:$('phoneStlDialog').open,title:$('phoneStlTitle').textContent,go:!$('phoneStlDialog').querySelector('[data-choice="go"]').hidden,text:$('phoneStlText').textContent}));
  ok(dlg.open&&/Large model/.test(dlg.title)&&dlg.go&&/MB/.test(dlg.text),'700k-triangle STL warns with memory estimates and "Load anyway" '+dlg.text.slice(0,90));
  await tapEl(p,cdp,'#phoneStlDialog [data-choice="cancel"]');await sleep(300);ok(await p.evaluate(()=>AppState.templateId==='etsyfolger-v1'),'Cancel loads nothing');
  if(/Pixel/.test(name)){
    // Load a real 641k-triangle tube anyway: preview copy capped for phones, export pre-flight warns, restore offers re-import.
    await p.setInputFiles('#templateStlInput',tubeStl(400,400));await p.waitForFunction(()=>$('phoneStlDialog').open,null,{timeout:10000});await tapEl(p,cdp,'#phoneStlDialog [data-choice="go"]');
    await p.waitForFunction(()=>AppState.templateId==='custom-stl'&&!customLoading,null,{timeout:180000}).catch(()=>{});await settle(p,180000);
    const ct=await p.evaluate(()=>({id:AppState.templateId,display:templateBase.indices.length/3,heavy:localStorage.getItem('caviot.heavyOp')}));
    ok(ct.id==='custom-stl'&&ct.display<=150000&&ct.heavy===null,'after "Load anyway": loaded, preview copy '+ct.display+' triangles (phone cap), heavy marker cleared');
    await p.setInputFiles('#fileInput',IMAGE);await p.waitForFunction(()=>!!AppState.image);await settle(p);
    await tapEl(p,cdp,'#generateBtn');await sleep(600);
    const hv=await p.evaluate(()=>({open:$('heavyExportDialog').open,text:$('heavyExportText').textContent,est:exportEstimate()}));
    ok(hv.open&&/million triangles/.test(hv.text)&&/kept on this phone/.test(hv.text),'export pre-flight warns for a large custom template '+JSON.stringify(hv.est));
    await tapEl(p,cdp,'#heavyExportDialog [data-choice="cancel"]');await sleep(300);
    await p.evaluate(()=>CaviotAutosave.flush());rec=await record(p);ok(rec&&rec.custom&&/caviot-p1-tube/.test(rec.custom.name),'autosave remembers only the template name '+JSON.stringify(rec&&rec.custom));
    await p.reload({waitUntil:'load'});await boot(p);
    got=await p.evaluate(()=>({tpl:AppState.templateId,img:!!AppState.image,banner:$('phoneBanner').textContent,btn:[...$('phoneBanner').querySelectorAll('button')].map(b=>b.textContent)}));
    ok(got.tpl==='etsyfolger-v1'&&got.img&&/custom template/.test(got.banner)&&got.btn.some(b=>/^Import /.test(b)),'restore never reloads the custom STL: ETSYFOLGER + offer to import it again '+JSON.stringify(got.btn));
    if(shot)await p.screenshot({path:shot+'reimport.png'});
    const chooser=p.waitForEvent('filechooser',{timeout:5000}).catch(()=>null);await tapEl(p,cdp,'#phoneBanner .btn-primary');ok(!!(await chooser),'Import opens the STL picker');
    await p.evaluate(()=>localStorage.setItem('caviot.heavyOp',JSON.stringify({kind:'export',at:Date.now()})));await p.reload({waitUntil:'load'});await boot(p);await sleep(1800);
    ok(/reloaded during an export/.test(await p.evaluate(()=>$('phoneBanner').textContent)),'after a reload during an export, a banner explains it and suggests a computer');
    await p.evaluate(()=>CaviotAutosave.discard());await p.reload({waitUntil:'load'});await boot(p);
  }
  // Phone image cap: a 4000×3000 photo is resized to 2048 px on the long side.
  await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=4000;c.height=3000;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,4000,3000);g.fillStyle='#000';g.fillRect(800,600,2400,1800);const b=await new Promise(r=>c.toBlob(r,'image/png'));loadImageFile(new File([b],'big.png',{type:'image/png'}))});
  await p.waitForFunction(()=>!!AppState.image&&AppState.imageName==='big.png',null,{timeout:30000}).catch(()=>{});await settle(p);
  const big=await p.evaluate(()=>({w:AppState.image.width,h:AppState.image.height}));ok(Math.max(big.w,big.h)<=2048&&big.w>2000,'large photo resized to 2048 px on the long side '+JSON.stringify(big));
  // ---------- 8. Export: Share first, correct name per side ----------
  await p.evaluate(()=>{const s=designSides[0];});await openSheet(p,cdp);await railTo(p,cdp,'phoneSecFinish');await tapEl(p,cdp,'label[for="modeCarved"]');await sleep(300);await closeSheet(p,cdp);
  const tag1=await p.evaluate(()=>exportReliefTag()+' '+JSON.stringify(designLayers.map(l=>l.map(s=>s.relief))));ok(/^deboss /.test(tag1),'one deboss side: file named "deboss" ('+tag1+')');
  await tapEl(p,cdp,'.template-toolbar [data-template-view="back"]');await sleep(400);await p.setInputFiles('#fileInput',IMAGE);await p.waitForFunction(()=>designLayers[1].some(s=>s.image),null,{timeout:30000});await settle(p);
  const tag2=await p.evaluate(()=>exportReliefTag()+' '+JSON.stringify(designLayers.map(l=>l.map(s=>s.relief))));ok(/^front-deboss_back-emboss /.test(tag2),'('+tag2+') '+'deboss front + emboss back: file named "front-deboss_back-emboss" (was named after the selected side only)');
  await settle(p);const iOS=await p.evaluate(()=>CaviotDevice.iOS);const dl=p.waitForEvent('download',{timeout:300000}).catch(()=>null);
  await tapEl(p,cdp,'#generateBtn');
  if(shareStub||iOS){await p.waitForFunction(()=>$('fileReadyDialog').open,null,{timeout:300000});
    const fr=await p.evaluate(()=>{const b=[...$('fileReadyDialog').querySelectorAll('[data-act]')].filter(b=>!b.hidden);return {order:b.map(x=>x.textContent),primary:b.find(x=>x.classList.contains('btn-primary'))?.textContent,name:$('fileReadyName').textContent,help:$('fileReadyHelp').textContent}});
    if(shareStub)ok(fr.order[0]==='Share…'&&fr.primary==='Share…','file ready: Share first '+JSON.stringify(fr.order));
    else ok(!fr.order.includes('Share…')&&fr.primary==='Download','file ready without sharing: Download is the main action '+JSON.stringify(fr.order));
    ok(/front-deboss_back-emboss\.stl · [\d.]+ MB/.test(fr.name),'file name: '+fr.name);ok(fr.order.includes('Open in new tab')===iOS,'"Open in new tab" only on iOS');
    if(shot)await p.screenshot({path:shot+'export.png'});
    if(shareStub){await tapEl(p,cdp,'#fileReadyDialog [data-act="share"]');await sleep(500);const sh=await p.evaluate(()=>window.__shared||null);ok(sh&&/front-deboss_back-emboss\.stl$/.test(sh.name)&&sh.size>1e6,'Share hands over the STL '+JSON.stringify(sh));if(await p.evaluate(()=>$('fileReadyDialog').open))await p.evaluate(()=>$('fileReadyDialog').close())}
    else{await tapEl(p,cdp,'#fileReadyDialog [data-act="download"]');const d=await dl;ok(!!d&&/front-deboss_back-emboss\.stl$/.test(d.suggestedFilename()),'Download fallback delivers '+(d&&d.suggestedFilename()));await p.evaluate(()=>$('fileReadyDialog').close())}
  }else{const d=await dl;ok(!!d&&/front-deboss_back-emboss\.stl$/.test(d.suggestedFilename()),'no Share available: direct download '+(d&&d.suggestedFilename()))}
  await settle(p);ok(await p.evaluate(()=>localStorage.getItem('caviot.heavyOp')===null&&/Exported/.test($('templateStatus').textContent)),'export finished; no leftover heavy-job marker');
  // Landscape: tools as a side sheet; the logo stays visible beside it.
  if(/iPhone 14/.test(name)){await p.setViewportSize({width:vp.h,height:vp.w});await sleep(700);await openSheet(p,cdp);await sleep(700);await tapEl(p,cdp,'.template-toolbar [data-template-view="front"]');await sleep(700);
    const l=await p.evaluate(()=>({left:document.querySelector('.sidebar').getBoundingClientRect().left}));const lp=await designPoint(p);
    ok(!!lp&&lp[0]<l.left-4,'landscape: logo visible beside the side sheet '+JSON.stringify({lp,l}));if(shot)await p.screenshot({path:shot+'landscape.png'});}
  const real=errors.filter(e=>!/willReadFrequently/.test(e));ok(!real.length,'no console/page errors '+JSON.stringify(real.slice(0,5)));
  await ctx.close();
}
await browser.close();
console.log(`\nmobile phase 1 e2e: ${passes} passed, ${failures} failed`);process.exit(failures?1:0);
