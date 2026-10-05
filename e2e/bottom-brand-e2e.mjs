// Bottom logo end-to-end checks: the DM diamond is on by default, forms on the ETSYFOLGER underside, exports closed
// and raised 0.4 mm, moves by middle-drag (desktop) and tap-then-drag (touch), switches logos without stretching,
// and with the logo off the export is byte-identical to a baseline build (optional second URL).
// usage: node bottom-brand-e2e.mjs <baseURL> [baselineURL] [shotPrefix]
// needs: npm i playwright-core; Chrome at $CHROME (default /usr/bin/google-chrome).
import {chromium,devices} from 'playwright-core';import fs from 'node:fs';import crypto from 'node:crypto';
const base=(process.argv[2]||'http://127.0.0.1:4173/').replace(/\/?$/,'/');const baseline=process.argv[3]&&process.argv[3]!=='-'?process.argv[3].replace(/\/?$/,'/'):null;
const shots=process.argv[4]||'';const IMAGE=process.env.IMAGE||new URL('./fixtures/badge.png',import.meta.url).pathname;
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let failures=0,passes=0;const ok=(cond,msg)=>{if(cond){passes++;console.log('  PASS',msg)}else{failures++;console.log('  FAIL',msg)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function settle(p,ms=180000){const t=Date.now();await sleep(300);while(Date.now()-t<ms){if(await p.evaluate(()=>typeof templatePreviewRunning!=='undefined'&&!!templateBase&&!templatePreviewRunning&&!templatePending&&!placementTimer&&!AppState.rebuildTimer&&!exportBusy))return true;await sleep(250)}return false}
const touch=async(cdp,type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id,radiusX:4,radiusY:4,force:1}))});
async function open(ctxOptions){
  const ctx=await browser.newContext(ctxOptions),p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push('page: '+e.message));p.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
  return{ctx,p,errors};
}
async function ready(p,url){await p.goto(url,{waitUntil:'load'});await p.waitForFunction(()=>typeof templateBase!=='undefined'&&!!templateBase&&(typeof bottomBrand==='undefined'||!bottomBrand.enabled||!!bottomMask),null,{timeout:120000});return settle(p)}
// A screen point on the logo's ink, found by projecting ink pixels of the mask onto the current view.
const logoPoint=p=>p.evaluate(()=>{const r=renderer.domElement.getBoundingClientRect(),b=bottomBrand,m=bottomMask,inside=b.surface==='inside',y=bottomRegionY[b.surface];
  for(let k=0;k<4000;k++){const u=((k*0.618034)%1),v=((k*0.414214)%1);if(m.hm[Math.round(v*(m.rows-1))*m.cols+Math.round(u*(m.cols-1))]<.9)continue;
    const w=new THREE.Vector3(b.centerX+(inside?-1:1)*(u-.5)*b.width,y,b.centerZ+(.5-v)*b.height).project(camera),x=r.left+(w.x+1)/2*r.width,yy=r.top+(1-w.y)/2*r.height,e={clientX:x,clientY:yy};
    if(document.elementFromPoint(x,yy)!==renderer.domElement)continue;const hit=bottomPointerHit(e);if(hit&&bottomArtworkAt(hit))return[x,yy]}return null});
// STL checks in node: closed (every edge shared by exactly two faces, consistent winding) and the raised logo.
function inspectSTL(buf){
  const n=buf.readUInt32LE(80),ids=new Map(),edges=new Map();let minZ=Infinity,bad=0;const low={x0:Infinity,x1:-Infinity,y0:Infinity,y1:-Infinity};
  const vid=o=>{const k=buf.readFloatLE(o)+','+buf.readFloatLE(o+4)+','+buf.readFloatLE(o+8);let id=ids.get(k);if(id===undefined){id=ids.size;ids.set(k,id)}return id};
  for(let f=0;f<n;f++){const o=84+f*50+12,v=[vid(o),vid(o+12),vid(o+24)];
    for(let i=0;i<3;i++){const z=buf.readFloatLE(o+i*12+8);minZ=Math.min(minZ,z);if(z<-.2){const x=buf.readFloatLE(o+i*12),y=buf.readFloatLE(o+i*12+4);low.x0=Math.min(low.x0,x);low.x1=Math.max(low.x1,x);low.y0=Math.min(low.y0,y);low.y1=Math.max(low.y1,y)}}
    for(let i=0;i<3;i++){const a=v[i],b=v[(i+1)%3],key=a<b?a*4e6+b:b*4e6+a,s=a<b?1:-1,e=edges.get(key)||[0,0];e[0]++;e[1]+=s;edges.set(key,e)}}
  for(const [c,s] of edges.values())if(c!==2||s!==0)bad++;
  return{triangles:n,badEdges:bad,minZ,low};
}
async function exportSTL(p){
  await settle(p);const dl=p.waitForEvent('download',{timeout:300000}).catch(()=>null);await p.click('#generateBtn');const d=await dl;if(!d)return null;
  const buf=fs.readFileSync(await d.path());await settle(p);return{buf,name:d.suggestedFilename(),status:await p.evaluate(()=>$('templateStatus').textContent)};
}

// ---------- Desktop ----------
{
  console.log('Desktop 1400x900');const {ctx,p,errors}=await open({viewport:{width:1400,height:900}});
  ok(await ready(p,base),'app and default bottom logo preview settled');
  const st=await p.evaluate(()=>({b:{...bottomBrand},checked:$('bottomBrandEnabled').checked,thumb:$('bottomBrandThumb').getAttribute('src'),status:$('bottomBrandStatus').textContent,summary:document.querySelector('#bottomBrandDetails summary').textContent,mask:[bottomMask.cols,bottomMask.rows]}));
  ok(st.b.enabled&&st.checked&&st.b.logo==='dm','DM logo on by default ('+st.summary+')');
  ok(st.b.surface==='underside'&&st.b.width===16&&st.b.height===15.67&&st.b.depthMm===.4&&st.b.relief==='raised','16 x 15.67 mm, 0.4 mm emboss, outside underside');
  ok(st.b.centerX===15.5&&st.b.centerZ===1,'centred on the flat pad at (15.5, 1)');
  ok(st.mask[0]===1024&&st.mask[1]===1003&&st.thumb==='branding/dm-diamond.png','relief mask 1024x1003, gold thumbnail');
  ok(/DM diamond logo formed on the underside at 0\.40 mm high/.test(st.status),'preview: '+st.status);
  if(shots)await p.screenshot({path:shots+'desktop-front.png'});
  await p.evaluate(()=>{$('bottomBrandDetails').open=true;setSettingsOpen?.(true);viewBottomBrand()});await sleep(800);
  if(shots){await p.screenshot({path:shots+'desktop-bottom.png'});
    await p.evaluate(()=>{controls.target.set(bottomBrand.centerX,0,bottomBrand.centerZ);camera.position.set(bottomBrand.centerX,-38,bottomBrand.centerZ);camera.lookAt(controls.target);controls.update()});await sleep(800);
    const box=await p.locator('#threeContainer').boundingBox();await p.screenshot({path:shots+'desktop-closeup.png',clip:box});
    await p.evaluate(()=>{const b=bottomBrand;controls.target.set(b.centerX,0,b.centerZ);camera.position.set(b.centerX+28,-22,b.centerZ-30);camera.lookAt(controls.target);controls.update()});await sleep(800);
    await p.screenshot({path:shots+'desktop-angle.png',clip:box});
    await p.evaluate(()=>viewBottomBrand());await sleep(500);}
  // Export with no sleeve artwork: the logo alone.
  const e=await exportSTL(p);ok(!!e,'STL export with only the default logo');
  if(e){const s=inspectSTL(e.buf);ok(s.badEdges===0,'closed and consistently wound ('+s.triangles.toLocaleString('en-US')+' triangles)');
    ok(Math.abs(s.minZ+.4)<.02,'logo raised 0.4 mm below the base (lowest z '+s.minZ.toFixed(3)+')');
    const w=s.low.x1-s.low.x0,h=s.low.y1-s.low.y0,cx=(s.low.x0+s.low.x1)/2,cy=(s.low.y0+s.low.y1)/2;
    ok(w>15.4&&w<16.2&&h>14.9&&h<15.8,'raised footprint '+w.toFixed(2)+' x '+h.toFixed(2)+' mm');
    ok(Math.abs(cx-15.5)<.4&&Math.abs(cy+1)<.4,'footprint centre ('+cx.toFixed(2)+', '+cy.toFixed(2)+') = studio (15.5, 1) in slicer axes');
    ok(/Exported/.test(e.status),'status: '+e.status.slice(0,100));}
  // Middle-button drag moves it.
  await p.evaluate(()=>viewBottomBrand());await sleep(600);const pt=await logoPoint(p);ok(!!pt,'logo found on screen');
  if(pt){const before=await p.evaluate(()=>[bottomBrand.centerX,bottomBrand.centerZ]);await p.mouse.move(pt[0],pt[1]);await p.mouse.down({button:'middle'});
    for(let i=1;i<=10;i++){await p.mouse.move(pt[0]-i*3,pt[1]+i*2);await sleep(16)}await p.mouse.up({button:'middle'});await sleep(200);
    const after=await p.evaluate(()=>({c:[bottomBrand.centerX,bottomBrand.centerZ],auto:bottomAuto,x:$('bottomBrandX').value}));
    ok(Math.hypot(after.c[0]-before[0],after.c[1]-before[1])>.5&&!after.auto,'middle-drag moved it: ('+before.map(v=>v.toFixed(2))+') -> ('+after.c.map(v=>v.toFixed(2))+'), panel X '+after.x);
    ok(await settle(p),'preview after the move');}
  await p.click('#bottomBrandCenter');await settle(p);ok(await p.evaluate(()=>bottomBrand.centerX===15.5&&bottomBrand.centerZ===1&&bottomAuto),'Fit returns it to the standard spot');
  // Logo switch keeps proportions.
  await p.selectOption('#bottomBrandLogo','mainline');await settle(p);
  const ml=await p.evaluate(()=>({...bottomBrand,thumb:$('bottomBrandThumb').getAttribute('src')}));ok(ml.logo==='mainline'&&ml.width===21&&ml.height===15.71&&ml.thumb==='branding/design-mainline.png','Design Mainline triangle selectable with its own start size');
  await p.selectOption('#bottomBrandLogo','dm');await settle(p);ok(await p.evaluate(()=>bottomBrand.logo==='dm'&&bottomBrand.width===16&&bottomBrand.height===15.67),'back to the DM logo');
  // Typed position.
  await p.fill('#bottomBrandX','17');await p.press('#bottomBrandX','Tab');await settle(p);ok(await p.evaluate(()=>bottomBrand.centerX===17&&!bottomAuto),'typed left/right position applied');
  await p.click('#bottomBrandCenter');await settle(p);
  // Off: removed from the preview; parity with the baseline build.
  await p.uncheck('#bottomBrandEnabled');await settle(p);ok(await p.evaluate(()=>!bottomBrand.enabled),'logo can be switched off');
  await p.setInputFiles('#fileInput',IMAGE);await p.waitForFunction(()=>!!AppState.image,null,{timeout:30000});ok(await settle(p),'artwork preview formed');
  const off=await exportSTL(p);const hash=off&&crypto.createHash('sha256').update(off.buf).digest('hex');
  ok(!!off&&inspectSTL(off.buf).minZ>-1e-4,'logo off: nothing below the base');
  if(baseline){const b=await open({viewport:{width:1400,height:900}});await ready(b.p,baseline);await b.p.setInputFiles('#fileInput',IMAGE);await b.p.waitForFunction(()=>!!AppState.image,null,{timeout:30000});await settle(b.p);
    const be=await exportSTL(b.p);const bh=be&&crypto.createHash('sha256').update(be.buf).digest('hex');
    ok(!!bh&&bh===hash,'logo off: STL byte-identical to the baseline ('+(hash||'').slice(0,12)+' vs '+(bh||'').slice(0,12)+', '+(be?be.buf.readUInt32LE(80).toLocaleString('en-US'):0)+' triangles)');
    ok(b.errors.length===0,'baseline: no console/page errors '+JSON.stringify(b.errors));await b.ctx.close();}
  // Logo back on with the artwork: closed export of both.
  await p.check('#bottomBrandEnabled');await settle(p);const both=await exportSTL(p);
  if(both){const s=inspectSTL(both.buf);ok(s.badEdges===0&&Math.abs(s.minZ+.4)<.02,'artwork + logo export closed ('+s.triangles.toLocaleString('en-US')+' triangles), logo raised 0.4 mm');}else ok(false,'artwork + logo export');
  // A project without bottom branding (older format) opens with it off; a saved one round-trips.
  const legacy=JSON.stringify({format:'icaviot-project',version:1,name:'Old',source:'',settings:{templateId:'etsyfolger-v1',mode:'sleeve'},image:null});
  fs.writeFileSync('/tmp/old-project.icaviot',legacy);await p.evaluate(()=>{window.confirm=()=>true});await p.setInputFiles('#projectFile','/tmp/old-project.icaviot');await sleep(1500);
  ok(await p.evaluate(()=>!bottomBrand.enabled),'older project without bottom branding opens with it off');
  ok(errors.length===0,'no console/page errors '+JSON.stringify(errors));await ctx.close();
}

// ---------- Custom templates ----------
function tubeSTL(ro=15,ri=13.5,h=40,n=96){ // closed tube: its only downward faces are a 1.5 mm ring, too thin for a logo
  const tris=[],P=(r,a,z)=>[r*Math.cos(a),r*Math.sin(a),z];
  for(let i=0;i<n;i++){const a=i/n*2*Math.PI,b=(i+1)/n*2*Math.PI;
    tris.push([P(ro,a,0),P(ro,b,0),P(ro,b,h)],[P(ro,a,0),P(ro,b,h),P(ro,a,h)],[P(ri,a,0),P(ri,b,h),P(ri,b,0)],[P(ri,a,0),P(ri,a,h),P(ri,b,h)],
      [P(ro,a,h),P(ro,b,h),P(ri,b,h)],[P(ro,a,h),P(ri,b,h),P(ri,a,h)],[P(ro,a,0),P(ri,b,0),P(ro,b,0)],[P(ro,a,0),P(ri,a,0),P(ri,b,0)])}
  const buf=Buffer.alloc(84+tris.length*50);buf.writeUInt32LE(tris.length,80);tris.forEach((t,k)=>t.forEach((v,j)=>v.forEach((c,m)=>buf.writeFloatLE(c,84+k*50+12+j*12+m*4))));return buf;
}
{
  console.log('Custom templates');const {ctx,p,errors}=await open({viewport:{width:1400,height:900}});await ready(p,base);
  const stl=Buffer.from(await (await fetch(base+'templates/ETSYFOLGER.stl')).arrayBuffer());fs.writeFileSync('/tmp/custom-etsy.stl',stl);fs.writeFileSync('/tmp/custom-tube.stl',tubeSTL());
  const custom=async(file)=>{await p.setInputFiles('#templateStlInput',file);await p.waitForFunction(()=>AppState.templateId==='custom-stl'&&templateBase&&templateBase!==builtinTemplateBase&&!customActivatePending,null,{timeout:180000});await sleep(500);return settle(p)};
  ok(await custom('/tmp/custom-etsy.stl'),'ETSYFOLGER uploaded as a custom template');
  let b=await p.evaluate(()=>({...bottomBrand,status:$('bottomBrandStatus').textContent,clear:BottomFit.logoClearance(bottomRegion('underside'),bottomMask,bottomBrand,1)}));
  ok(b.enabled&&b.width===16&&b.clear>=2,'logo fitted to the custom underside: 16 mm at ('+b.centerX+', '+b.centerZ+'), '+b.clear.toFixed(2)+' mm clear of its edges');
  const e=await exportSTL(p);if(e){const s=inspectSTL(e.buf);ok(s.badEdges===0&&Math.abs(s.minZ+.4)<.02,'custom template export with the logo is closed ('+s.triangles.toLocaleString('en-US')+' triangles)')}else ok(false,'custom template export');
  ok(await custom('/tmp/custom-tube.stl'),'thin-walled tube uploaded');
  b=await p.evaluate(()=>({...bottomBrand,status:$('bottomBrandStatus').textContent}));
  ok(!b.enabled&&/no flat underside area big enough/.test(b.status),'no room on the tube: the default logo switched itself off ("'+b.status.slice(0,70)+'…")');
  await p.selectOption('#templateChoice','etsyfolger-v1');await sleep(500);await settle(p);
  b=await p.evaluate(()=>({...bottomBrand}));ok(b.enabled&&b.centerX===15.5&&b.centerZ===1&&b.width===16,'back on ETSYFOLGER: logo on again at the standard spot');
  ok(errors.length===0,'no console/page errors '+JSON.stringify(errors));await ctx.close();
}

// ---------- Phone (touch) ----------
for(const name of ['iPhone 14','Pixel 7']){
  console.log(name);const {ctx,p,errors}=await open({...devices[name]});const cdp=await ctx.newCDPSession(p);
  ok(await ready(p,base),'app and default bottom logo preview settled');
  ok(await p.evaluate(()=>bottomBrand.enabled&&bottomBrand.logo==='dm'&&bottomBrand.width===16),'DM logo on by default');
  await p.evaluate(()=>viewBottomBrand());await sleep(800);if(shots)await p.screenshot({path:shots+name.replace(/\s+/g,'-').toLowerCase()+'-bottom.png'});
  let pt=await logoPoint(p);ok(!!pt,'logo found on screen');
  if(pt){await touch(cdp,'touchStart',[pt]);await sleep(40);await touch(cdp,'touchEnd',[]);await sleep(500);
    ok(await p.evaluate(()=>bottomSelected),'tap selects the bottom logo');ok(await p.evaluate(()=>!settingsAreOpen()),'a single tap keeps the tools sheet closed');
    const cam0=await p.evaluate(()=>camera.position.toArray());const before=await p.evaluate(()=>[bottomBrand.centerX,bottomBrand.centerZ]);
    pt=await logoPoint(p);await touch(cdp,'touchStart',[pt]);for(let i=1;i<=12;i++){await touch(cdp,'touchMove',[[pt[0]+i*2,pt[1]+i*1.5]]);await sleep(16)}await touch(cdp,'touchEnd',[]);await sleep(300);
    const after=await p.evaluate(()=>[bottomBrand.centerX,bottomBrand.centerZ]),cam1=await p.evaluate(()=>camera.position.toArray());
    ok(Math.hypot(after[0]-before[0],after[1]-before[1])>.3,'touch-drag moved the logo ('+before.map(v=>v.toFixed(2))+') -> ('+after.map(v=>v.toFixed(2))+')');
    ok(cam0.every((v,i)=>Math.abs(v-cam1[i])<1e-6),'camera did not orbit during the logo drag');
    ok(await p.evaluate(()=>controls.enabled),'orbit re-enabled');await settle(p);
    // A drag away from the logo orbits and drops the selection on the next tap elsewhere.
    // (vertical: the bottom view looks straight up the orbit axis, where a sideways drag only spins the view in place)
    const vp=p.viewportSize();await touch(cdp,'touchStart',[[vp.width*.15,vp.height*.3]]);for(let i=1;i<=10;i++){await touch(cdp,'touchMove',[[vp.width*.15,vp.height*.3+i*8]]);await sleep(16)}await touch(cdp,'touchEnd',[]);await sleep(200);
    const cam2=await p.evaluate(()=>camera.position.toArray()),moved2=await p.evaluate(()=>[bottomBrand.centerX,bottomBrand.centerZ]);ok(cam2.some((v,i)=>Math.abs(v-cam1[i])>1e-3)&&moved2.every((v,i)=>v===after[i]),'drag elsewhere orbits and leaves the logo in place');}
  ok(errors.length===0,'no console/page errors '+JSON.stringify(errors));await ctx.close();
}
await browser.close();
console.log('\nbottom-brand e2e: '+passes+' passed, '+failures+' failed');process.exit(failures?1:0);
