// Built-in bottom logo end-to-end checks: the Foger Sleeve always carries the DM diamond carved 0.4 mm into its
// outside underside. There is no control for it in the tools, exports are closed and flat on the bed, side image
// emboss/deboss still export, old projects with bottom branding fields open, and custom STL templates get no logo.
// usage: node bottom-brand-e2e.mjs <baseURL> [-] [shotPrefix]   (the second argument is unused and kept for scripts)
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
// STL checks in node: closed (every edge shared by exactly two faces, consistent winding) and the raised logo.
function inspectSTL(buf){
  const n=buf.readUInt32LE(80),ids=new Map(),edges=new Map();let minZ=Infinity,bad=0;const low={x0:Infinity,x1:-Infinity,y0:Infinity,y1:-Infinity};
  const vid=o=>{const k=buf.readFloatLE(o)+','+buf.readFloatLE(o+4)+','+buf.readFloatLE(o+8);let id=ids.get(k);if(id===undefined){id=ids.size;ids.set(k,id)}return id};
  for(let f=0;f<n;f++){const o=84+f*50+12,v=[vid(o),vid(o+12),vid(o+24)];
    for(let i=0;i<3;i++){const z=buf.readFloatLE(o+i*12+8);minZ=Math.min(minZ,z);const x=buf.readFloatLE(o+i*12),y=buf.readFloatLE(o+i*12+4);if(z>.37&&z<.43&&Math.abs(x-15.5)<9&&Math.abs(y+1)<9){low.x0=Math.min(low.x0,x);low.x1=Math.max(low.x1,x);low.y0=Math.min(low.y0,y);low.y1=Math.max(low.y1,y)}}
    for(let i=0;i<3;i++){const a=v[i],b=v[(i+1)%3],key=a<b?a*4e6+b:b*4e6+a,s=a<b?1:-1,e=edges.get(key)||[0,0];e[0]++;e[1]+=s;edges.set(key,e)}}
  for(const [c,s] of edges.values())if(c!==2||s!==0)bad++;
  return{triangles:n,badEdges:bad,minZ,low};
}
async function exportSTL(p){
  await settle(p);const dl=p.waitForEvent('download',{timeout:300000}).catch(()=>null);await p.click('#generateBtn');const d=await dl;if(!d)return null;
  const buf=fs.readFileSync(await d.path());await settle(p);return{buf,name:d.suggestedFilename(),status:await p.evaluate(()=>$('templateStatus').textContent)};
}

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');const hashes={};
const footprintOK=s=>{const w=s.low.x1-s.low.x0,h=s.low.y1-s.low.y0,cx=(s.low.x0+s.low.x1)/2,cy=(s.low.y0+s.low.y1)/2;return{ok:w>14&&w<16.3&&h>13.5&&h<16&&Math.abs(cx-15.5)<.6&&Math.abs(cy+1)<.6,txt:w.toFixed(2)+' x '+h.toFixed(2)+' mm at ('+cx.toFixed(2)+', '+cy.toFixed(2)+')'}};
const checkExport=(e,label,logo=true)=>{if(!e){ok(false,label+': export');return}const s=inspectSTL(e.buf),f=footprintOK(s);hashes[label]=sha(e.buf);
  ok(s.badEdges===0,label+': closed and consistently wound ('+s.triangles.toLocaleString('en-US')+' triangles)');
  ok(s.minZ>-1e-4,label+': nothing below the bed (lowest z '+s.minZ.toFixed(4)+')');
  if(logo)ok(f.ok,label+': carved DM floor 0.4 mm up, '+f.txt);
  ok(/Foger-Sleeve/.test(e.name)||!logo,label+': file name '+e.name);};

// ---------- Desktop ----------
{
  console.log('Desktop 1400x900');const {ctx,p,errors}=await open({viewport:{width:1400,height:900}});
  ok(await ready(p,base),'app and built-in bottom logo preview settled');
  const st=await p.evaluate(()=>({b:{...bottomBrand},panel:!!document.getElementById('bottomBrandPanel'),ctl:document.querySelectorAll('[id^="bottomBrand"]').length,text:document.querySelector('.sidebar').innerText,label:$('templateChoice').selectedOptions[0].textContent,toolbar:document.querySelector('#templateToolbar span').textContent,mask:[bottomMask.cols,bottomMask.rows]}));
  ok(!st.panel&&st.ctl===0&&!/Bottom branding|Add bottom logo/.test(st.text),'no bottom branding controls anywhere in the tools');
  ok(st.label.startsWith('Foger Sleeve')&&st.toolbar==='Foger Sleeve'&&!/ETSYFOLGER/.test(st.text),'template is called Foger Sleeve ("'+st.label+'")');
  ok(st.b.enabled&&st.b.surface==='underside'&&st.b.width===16&&st.b.height===15.67&&st.b.depthMm===.4&&st.b.relief==='carved'&&st.b.centerX===15.5&&st.b.centerZ===1,'built-in DM deboss: 16 x 15.67 mm, 0.4 mm deep at (15.5, 1)');
  ok(await p.evaluate(()=>{try{bottomBrand.width=40}catch{}return bottomDefaults.width===16&&Object.isFrozen(bottomDefaults)}),'logo settings cannot be changed');
  ok(st.mask[0]===1024&&st.mask[1]===1003,'relief mask 1024x1003');
  if(shots){await p.evaluate(()=>setSettingsOpen?.(true));await sleep(400);await p.screenshot({path:shots+'desktop-tools.png'});}
  await p.evaluate(()=>viewBottomBrand());await sleep(800);
  if(shots){await p.screenshot({path:shots+'desktop-bottom.png'});
    const box=await p.locator('#threeContainer').boundingBox();
    await p.evaluate(()=>{controls.target.set(15.5,0,1);camera.position.set(15.5,-38,1);camera.lookAt(controls.target);controls.update()});await sleep(800);await p.screenshot({path:shots+'desktop-closeup.png',clip:box});
    await p.evaluate(()=>{controls.target.set(15.5,0,1);camera.position.set(43.5,-22,-29);camera.lookAt(controls.target);controls.update()});await sleep(800);await p.screenshot({path:shots+'desktop-angle.png',clip:box});
    await p.evaluate(()=>viewBottomBrand());await sleep(500);}
  checkExport(await exportSTL(p),'plain Foger Sleeve');
  await p.setInputFiles('#fileInput',IMAGE);await p.waitForFunction(()=>!!AppState.image,null,{timeout:30000});ok(await settle(p),'artwork preview formed');
  checkExport(await exportSTL(p),'image emboss');
  await p.click('label[for="modeCarved"]');await sleep(300);ok(await settle(p),'deboss preview formed');
  ok(await p.evaluate(()=>/deboss/.test(exportReliefTag())),'side design is deboss');
  checkExport(await exportSTL(p),'image deboss');
  // Older projects that saved adjustable bottom branding (even the triangle on the inside) open fine; the logo stays built in.
  for(const [name,extra] of [['no branding',{}],['old triangle inside',{bottomBrand:{enabled:true,logo:'mainline',surface:'inside',width:13,height:9.725,centerX:15.5,centerZ:7}}],['old logo off',{bottomBrand:{enabled:false,surface:'underside',width:16,height:15.67,centerX:15.5,centerZ:1,depthMm:.4,relief:'raised'}}]]){
    fs.writeFileSync('/tmp/old-project.icaviot',JSON.stringify({format:'icaviot-project',version:1,name:'Old',source:'',settings:{templateId:'etsyfolger-v1',mode:'sleeve'},image:null,...extra}));
    await p.evaluate(()=>{window.confirm=()=>true});await p.setInputFiles('#projectFile','/tmp/old-project.icaviot');await sleep(1500);await settle(p);
    ok(await p.evaluate(()=>AppState.templateId==='etsyfolger-v1'&&bottomBrand.enabled&&bottomBrand.relief==='carved'&&$('projectName').value==='Old'),'older project ('+name+') opens on the Foger Sleeve with the built-in logo');}
  ok(errors.length===0,'no console/page errors '+JSON.stringify(errors));await ctx.close();
}

// ---------- Custom templates ----------
{
  console.log('Custom templates');const {ctx,p,errors}=await open({viewport:{width:1400,height:900}});await ready(p,base);
  const stl=Buffer.from(await (await fetch(base+'templates/ETSYFOLGER.stl')).arrayBuffer());fs.writeFileSync('/tmp/custom-etsy.stl',stl);
  await p.evaluate(()=>{window.__prevTemplateBase=templateBase});await p.setInputFiles('#templateStlInput','/tmp/custom-etsy.stl');await p.waitForFunction(()=>AppState.templateId==='custom-stl'&&templateBase&&templateBase!==builtinTemplateBase&&templateBase!==window.__prevTemplateBase&&!customActivatePending,null,{timeout:180000});await sleep(500);ok(await settle(p),'Foger Sleeve STL uploaded as a custom template');
  ok(await p.evaluate(()=>!bottomBrand.enabled),'custom template: no built-in logo');
  await p.setInputFiles('#fileInput',IMAGE);await p.waitForFunction(()=>!!AppState.image,null,{timeout:30000});await settle(p);
  const e=await exportSTL(p);if(e){const s=inspectSTL(e.buf);ok(s.badEdges===0&&s.minZ>-1e-4,'custom template export closed ('+s.triangles.toLocaleString('en-US')+' triangles)');ok(!footprintOK(s).ok,'custom template export has no DM carve')}else ok(false,'custom template export');
  await p.selectOption('#templateChoice','etsyfolger-v1');await sleep(500);await settle(p);
  ok(await p.evaluate(()=>bottomBrand.enabled),'back on the Foger Sleeve: the logo is there again');
  ok(errors.length===0,'no console/page errors '+JSON.stringify(errors));await ctx.close();
}

// ---------- Phone ----------
for(const name of ['iPhone 14','Pixel 7']){
  console.log(name);const {ctx,p,errors}=await open({...devices[name]});
  ok(await ready(p,base),'app and built-in bottom logo preview settled');
  ok(await p.evaluate(()=>bottomBrand.enabled&&!document.getElementById('bottomBrandPanel')),'logo built in, no control in the phone sheet');
  await p.evaluate(()=>viewBottomBrand());await sleep(800);if(shots)await p.screenshot({path:shots+name.replace(/\s+/g,'-').toLowerCase()+'-bottom.png'});
  ok(errors.length===0,'no console/page errors '+JSON.stringify(errors));await ctx.close();
}
await browser.close();
console.log('\nhashes '+JSON.stringify(hashes,null,1));
console.log('\nbottom-brand e2e: '+passes+' passed, '+failures+' failed');process.exit(failures?1:0);
