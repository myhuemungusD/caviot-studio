// Mobile end-to-end checks with device emulation and real touch input (Chromium + CDP touch events).
// usage: node mobile-e2e.mjs <baseURL> [deviceNames,comma,separated] [shotPrefix]
// needs: npm i playwright-core; Chrome at $CHROME (default /usr/bin/google-chrome); fixture image at $IMAGE.
import {chromium,devices} from 'playwright-core';import fs from 'node:fs';
const base=(process.argv[2]||'http://127.0.0.1:4173/').replace(/\/?$/,'/');
const names=(process.argv[3]||'iPhone 14,iPhone SE,Pixel 7,iPad (gen 7)').split(',');
const shots=process.argv[4]||'';const IMAGE=process.env.IMAGE||new URL('./fixtures/badge.png',import.meta.url).pathname;
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let failures=0,passes=0;const ok=(cond,msg)=>{if(cond){passes++;console.log('  PASS',msg)}else{failures++;console.log('  FAIL',msg)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function settle(p,ms=90000){const t=Date.now();await sleep(300);while(Date.now()-t<ms){if(await p.evaluate(()=>typeof templatePreviewRunning!=='undefined'&&!!templateBase&&!templatePreviewRunning&&!templatePending&&!placementTimer&&!AppState.rebuildTimer&&!exportBusy))return true;await sleep(250)}return false}
const touch=async(cdp,type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id,radiusX:4,radiusY:4,force:1}))});
async function drag(cdp,from,to,steps=12){await touch(cdp,'touchStart',[from]);for(let i=1;i<=steps;i++){await touch(cdp,'touchMove',[[from[0]+(to[0]-from[0])*i/steps,from[1]+(to[1]-from[1])*i/steps]]);await sleep(16)}await touch(cdp,'touchEnd',[]);}
async function tap(cdp,pt){await touch(cdp,'touchStart',[pt]);await sleep(40);await touch(cdp,'touchEnd',[]);}
async function pinch(cdp,c,from,to,steps=12){const pts=d=>[[c[0]-d,c[1]],[c[0]+d,c[1]]];await touch(cdp,'touchStart',[pts(from)[0]]);await sleep(10);await touch(cdp,'touchStart',pts(from));for(let i=1;i<=steps;i++){await touch(cdp,'touchMove',pts(from+(to-from)*i/steps));await sleep(16)}await touch(cdp,'touchEnd',[]);}
const camState=p=>p.evaluate(()=>({pos:camera.position.toArray().map(v=>+v.toFixed(3)),dist:+camera.position.distanceTo(controls.target).toFixed(3)}));
// A screen point on the selected design: start at its projected centre, then search outward for painted pixels.
const designPoint=p=>p.evaluate(()=>{const t=(AppState.designAngle+90)*Math.PI/180,R=30,v=new THREE.Vector3(Math.cos(t)*R,AppState.designY,Math.sin(t)*R).project(camera),r=renderer.domElement.getBoundingClientRect();const c=[r.left+(v.x+1)/2*r.width,r.top+(1-v.y)/2*r.height];
 for(let ring=0;ring<30;ring++)for(let a=0;a<Math.max(1,ring*6);a++){const ang=a/Math.max(1,ring*6)*Math.PI*2,x=c[0]+Math.cos(ang)*ring*8,y=c[1]+Math.sin(ang)*ring*8;if(document.elementFromPoint(x,y)===renderer.domElement&&touchHitsSelectedDesign({clientX:x,clientY:y}))return [x,y];}return c});
// A canvas point with no part of the selected design within 60 px (two-finger gestures there move the camera).
const offDesignPoint=p=>p.evaluate(()=>{const r=renderer.domElement.getBoundingClientRect();for(const [fx,fy] of [[.25,.25],[.75,.25],[.25,.8],[.75,.8]]){const x=r.left+r.width*fx,y=r.top+r.height*fy;let near=false;for(const [dx,dy] of [[0,0],[60,0],[-60,0],[0,40],[0,-40]])if(touchHitsSelectedDesign({clientX:x+dx,clientY:y+dy}))near=true;if(!near)return [x,y]}return [r.left+r.width*.25,r.top+r.height*.85]});
let offDesign=null;
for(const name of names){
  const landscape=/ landscape$/.test(name),dev={...devices[name.replace(/ landscape$/,'')]};if(landscape)dev.viewport={width:dev.viewport.height,height:dev.viewport.width};
  console.log('==',name,JSON.stringify(dev.viewport));const shot=shots&&(shots+name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')+'-');
  const ctx=await browser.newContext({...dev,acceptDownloads:true});const p=await ctx.newPage();const errors=[];
  p.on('pageerror',e=>errors.push('pageerror: '+e.message));p.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
  p.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url())});
  const cdp=await ctx.newCDPSession(p);
  await p.goto(base,{waitUntil:'load'});await p.waitForFunction(()=>typeof templateBase!=='undefined'&&!!templateBase,null,{timeout:60000});await settle(p);
  const phone=await p.evaluate(()=>CaviotDevice.phoneLayout());const isIPad=/iPad/.test(name);
  ok(phone===!isIPad,'phone layout '+(isIPad?'off on iPad':'on'));
  const info=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,sh:document.documentElement.scrollHeight,ih:innerHeight,vp:document.querySelector('meta[name=viewport]').content,manifest:!!document.querySelector('link[rel=manifest]'),accept:$('fileInput').accept,tier:CaviotDevice.tier}));
  ok(info.sw<=info.iw,'no horizontal scroll ('+info.sw+' <= '+info.iw+')');
  ok(/viewport-fit=cover/.test(info.vp)&&info.manifest,'viewport-fit=cover and manifest link');
  ok(info.accept==='image/*','file picker accepts image/* (camera roll and camera)');
  ok(info.tier===(isIPad?'full':'light'),'device tier '+info.tier);
  if(phone){
    const small=await p.evaluate(()=>[...document.querySelectorAll('.projectbar button,.topbar button,.template-toolbar button')].filter(b=>b.offsetParent&&getComputedStyle(b).visibility!=='hidden').map(b=>{const r=b.getBoundingClientRect();return {id:b.id||b.textContent.trim(),w:Math.round(r.width),h:Math.round(r.height)}}).filter(b=>b.h<44||b.w<44));
    ok(!small.length,'visible bar buttons are finger-sized '+JSON.stringify(small));
    const hidden=await p.evaluate(()=>['saveProject','openProject','guideBtn','downloadObjBtn','openSTL'].every(id=>!$(id).offsetParent));
    ok(hidden,'Save/Open/Guide/OBJ/STL moved to the overflow menu');
    await tap(cdp,await p.evaluate(()=>{const r=$('mobileMoreBtn').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}));await sleep(200);
    const menu=await p.evaluate(()=>({open:!$('mobileMenu').hidden,items:[...$('mobileMenu').querySelectorAll('button')].map(b=>b.textContent)}));
    ok(menu.open&&menu.items.includes('Save project')&&menu.items.includes('Export OBJ')&&menu.items.includes('Guide'),'overflow menu: '+menu.items.join(' / '));
    await tap(cdp,[20,info.ih*.7]);await sleep(200);ok(await p.evaluate(()=>$('mobileMenu').hidden&&!document.querySelector('dialog[open]')),'tap outside closes the menu');
  }
  // Add artwork through the image picker.
  await p.setInputFiles('#fileInput',IMAGE);await p.waitForFunction(()=>!!AppState.image,null,{timeout:30000});ok(await settle(p),'artwork preview formed');
  if(!phone&&await p.evaluate(()=>settingsAreOpen()&&innerWidth<=900)){await p.tap('#mobileSettingsBtn');await sleep(400);}
  await p.evaluate(()=>templateView('front'));await sleep(400);
  if(shot&&phone&&!landscape)await p.screenshot({path:shot+'main.png'});
  const pt=await designPoint(p);
  // Tap selects (and does not open the sheet on a phone).
  await tap(cdp,pt);await sleep(300);
  ok(/Editing|Drag the selected/.test(await p.evaluate(()=>$('templateStatus').textContent)),'tap on the design selects it');
  if(phone)ok(!(await p.evaluate(()=>settingsAreOpen())),'single tap keeps the tools sheet closed');
  // Drag on the selected design moves it; the camera stays put.
  let cam=await camState(p);const angle0=await p.evaluate(()=>AppState.designAngle);
  await drag(cdp,pt,[pt[0]+Math.min(80,info.iw*.18),pt[1]+10]);await settle(p);
  const angle1=await p.evaluate(()=>AppState.designAngle);const cam1=await camState(p);
  ok(Math.abs(angle1-angle0)>3,'touch-drag on the selected design moves it ('+angle0.toFixed(1)+'° → '+angle1.toFixed(1)+'°)');
  ok(JSON.stringify(cam.pos)===JSON.stringify(cam1.pos),'camera did not orbit during the design drag');
  ok(await p.evaluate(()=>controls.enabled&&!templateMove),'orbit is re-enabled after the drag');
  // A drag elsewhere orbits and leaves the design alone.
  const empty=await p.evaluate(()=>{const r=renderer.domElement.getBoundingClientRect();return [r.left+12,r.top+r.height*.62]});
  await drag(cdp,empty,[empty[0]+70,empty[1]+20]);await sleep(600);
  const cam2=await camState(p);ok(JSON.stringify(cam2.pos)!==JSON.stringify(cam1.pos),'one-finger drag on the background orbits');
  ok(Math.abs((await p.evaluate(()=>AppState.designAngle))-angle1)<1e-9,'orbit drag did not move the design');
  // Pinch that starts on the design: a phone resizes the selected design (phase 1), a tablet zooms as before.
  await p.evaluate(()=>templateView('front'));await sleep(500);const pt2=await designPoint(p);const before=await camState(p);const size0=await p.evaluate(()=>[AppState.designWidth,AppState.designHeight]);
  await pinch(cdp,pt2,30,110);await sleep(700);const after=await camState(p);
  if(phone){const size1=await p.evaluate(()=>[AppState.designWidth,AppState.designHeight]);
    ok(size1[0]>size0[0]*1.2&&after.dist===before.dist,'phone: pinch on the selected design resizes it, camera still ('+size0.join('×')+' → '+size1.join('×')+')');
    await p.evaluate(([w,h])=>{AppState.designWidth=w;AppState.designHeight=h;showPlacementValue('designWidth');showPlacementValue('designHeight');updatePlacement();finishPlacement()},size0);await settle(p);
    await pinch(cdp,offDesign=await offDesignPoint(p),20,60);await sleep(700);ok((await camState(p)).dist<before.dist-1,'phone: pinch away from the design zooms');}
  else ok(after.dist<before.dist-1,'pinch zooms in ('+before.dist+' → '+after.dist+')');
  ok(Math.abs((await p.evaluate(()=>AppState.designAngle))-angle1)<.5,'pinch over the design did not move it');
  // Two-finger pan (away from the selected design on a phone, where two fingers on it resize and rotate it).
  const t0=await p.evaluate(()=>controls.target.toArray());const c=phone?offDesign:[info.iw/2,info.ih/2];
  await touch(cdp,'touchStart',[[c[0]-40,c[1]]]);await touch(cdp,'touchStart',[[c[0]-40,c[1]],[c[0]+40,c[1]]]);for(let i=1;i<=10;i++){await touch(cdp,'touchMove',[[c[0]-40,c[1]+i*6],[c[0]+40,c[1]+i*6]]);await sleep(16)}await touch(cdp,'touchEnd',[]);await sleep(500);
  ok(JSON.stringify(await p.evaluate(()=>controls.target.toArray()))!==JSON.stringify(t0),'two-finger drag pans');
  await settle(p);
  // Double tap on the selected design opens its settings.
  if(phone){await p.evaluate(()=>templateView('front'));await sleep(400);const pt3=await designPoint(p);
    // Software GL takes ~300 ms per frame here, longer than a double tap; pause drawing so touch timing is realistic.
    await p.evaluate(()=>{window.__render=renderer.render;renderer.render=()=>{}});await tap(cdp,pt3);await sleep(60);await tap(cdp,pt3);await sleep(300);await p.evaluate(()=>{renderer.render=window.__render});await sleep(300);
    ok(await p.evaluate(()=>settingsAreOpen()),'double-tap on the design opens the tools sheet');
    const sheet=await p.evaluate(()=>{const r=document.querySelector('.sidebar').getBoundingClientRect();const range=[...document.querySelectorAll('.sidebar input[type=range]')].find(r=>r.offsetParent);return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,vis:getComputedStyle(document.querySelector('.sidebar')).visibility,range:range?range.getBoundingClientRect().height:0}});
    ok(sheet.vis==='visible'&&sheet.left>=0&&sheet.right<=info.iw+1&&sheet.bottom<=info.ih+1,'sheet on screen '+JSON.stringify(sheet));
    ok(sheet.range>=40,'sliders are finger-sized ('+sheet.range+'px)');
    if(shot&&!landscape)await p.screenshot({path:shot+'drawer.png'});
    await p.click('.sheet-done');await sleep(400);ok(!(await p.evaluate(()=>settingsAreOpen())),'Done closes the sheet');
  }
  // Export STL from the bottom bar.
  await settle(p);const dlWait=p.waitForEvent('download',{timeout:240000}).catch(()=>null);
  await p.tap('#generateBtn');
  const iOS=await p.evaluate(()=>CaviotDevice.iOS);let download;
  if(iOS){await p.waitForFunction(()=>$('fileReadyDialog').open,null,{timeout:240000});const label=await p.evaluate(()=>$('fileReadyName').textContent);ok(/\.stl · [\d.]+ MB/.test(label),'iOS file-ready sheet: '+label);
    if(shot&&phone&&!landscape)await p.screenshot({path:shot+'export.png'});
    await p.tap('#fileReadyDialog [data-act="download"]');}
  download=await dlWait;ok(!!download,'STL download delivered');
  if(download){const file=await download.path();const buf=fs.readFileSync(file);const tris=buf.readUInt32LE(80);ok(buf.length===84+tris*50&&tris>100000,'STL is valid: '+tris.toLocaleString()+' triangles, '+(buf.length/1048576).toFixed(1)+' MB ('+download.suggestedFilename()+')');}
  const status=await p.evaluate(()=>$('templateStatus').textContent);ok(/Exported/.test(status),'status: '+status.slice(0,110));
  if(!isIPad)ok(/0\.20 mm/.test(status),'phone-safe contour spacing used');
  if(iOS)await p.evaluate(()=>$('fileReadyDialog').close());
  // Full quality on a phone asks first; Cancel starts nothing.
  if(phone&&/Pixel/.test(name)){await p.tap('#mobileSettingsBtn');await sleep(500);await p.evaluate(()=>{const d=document.getElementById('phoneAllSettings');if(d)d.open=true});await sleep(200);await p.selectOption('#exportQuality','full');await sleep(200);
    ok(await p.evaluate(()=>CaviotDevice.tier==='full'),'Export quality: Full switches the limits');await p.click('.sheet-done');await sleep(400);
    await p.tap('#generateBtn');await sleep(500);ok(await p.evaluate(()=>$('heavyExportDialog').open),'heavy-export warning shown before a full-quality phone export');
    await p.click('#heavyExportDialog [data-choice="cancel"]');await sleep(300);ok(await p.evaluate(()=>!exportBusy&&!$('heavyExportDialog').open),'Cancel starts no export');
    await p.tap('#generateBtn');await sleep(500);await p.click('#heavyExportDialog [data-choice="safe"]');await sleep(300);
    ok(await p.evaluate(()=>CaviotDevice.tier==='light'&&$('exportQuality').value==='safe'),'"Use phone-safe quality" switches back');
    const dl2=await p.waitForEvent('download',{timeout:240000}).catch(()=>null);ok(!!dl2,'phone-safe export after the warning delivered');await settle(p);}
  // WebGL context loss and restore keep the page alive.
  await p.evaluate(()=>{window.__lose=renderer.getContext().getExtension('WEBGL_lose_context');__lose.loseContext()});await sleep(300);
  ok(await p.evaluate(()=>document.body.classList.contains('webgl-lost')),'context loss shows the paused note');
  await p.evaluate(()=>__lose.restoreContext());await sleep(800);
  ok(await p.evaluate(()=>!document.body.classList.contains('webgl-lost')&&!renderer.getContext().isContextLost()),'context restored');
  // Rotate the phone.
  if(phone&&!landscape){await p.setViewportSize({width:dev.viewport.height,height:dev.viewport.width});await sleep(600);
    const l=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,canvas:renderer.domElement.getBoundingClientRect().width,phone:CaviotDevice.phoneLayout()}));
    ok(l.phone&&l.sw<=l.iw&&l.canvas>=l.iw-2,'landscape: phone layout, full-width canvas, no horizontal scroll '+JSON.stringify(l));
    await p.tap('#mobileSettingsBtn');await sleep(900);await p.waitForFunction(()=>getComputedStyle(document.querySelector('.sidebar')).transform==='none',null,{timeout:8000}).catch(()=>{});const side=await p.evaluate(()=>{const r=document.querySelector('.sidebar').getBoundingClientRect();return {left:r.left,right:r.right,w:r.width,iw:innerWidth}});
    ok(side.right<=side.iw+1&&side.w<side.iw*.6,'landscape: tools open as a side sheet '+JSON.stringify(side));
    if(shot)await p.screenshot({path:shot+'landscape.png'});}
  const real=errors.filter(e=>!/willReadFrequently/.test(e));ok(!real.length,'no console/page errors '+JSON.stringify(real.slice(0,5)));
  await ctx.close();
}
await browser.close();
console.log(`\nmobile e2e: ${passes} passed, ${failures} failed`);process.exit(failures?1:0);
