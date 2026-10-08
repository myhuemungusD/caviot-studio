// Sharp lettering in a real browser: for several fonts and every non-template output shape, the text preview is a
// closed outline mesh whose letter edges sit on the true (anti-aliased) glyph outline, with no pixel stair steps,
// and the exported STL is the same closed mesh. The old grid path is measured on the same text for comparison.
// usage: node text-relief-e2e.mjs <baseURL> [shotPrefix]
// needs: npm i playwright-core; Chrome at $CHROME (default /usr/bin/google-chrome).
import {chromium} from 'playwright-core';import fs from 'node:fs';
const base=(process.argv[2]||'http://127.0.0.1:4173/').replace(/\/?$/,'/');const shots=process.argv[3]||'';
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let failures=0,passes=0;const ok=(cond,msg)=>{if(cond){passes++;console.log('  PASS',msg)}else{failures++;console.log('  FAIL',msg)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function settle(p,ms=120000){const t=Date.now();await sleep(300);while(Date.now()-t<ms){if(await p.evaluate(()=>!AppState.rebuildTimer&&!exportBusy&&!(typeof templatePreviewRunning!=='undefined'&&(templatePreviewRunning||templatePending))))return true;await sleep(200)}return false}
async function open(){const ctx=await browser.newContext({viewport:{width:1500,height:900},acceptDownloads:true});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base);await p.waitForFunction(()=>typeof templateBase!=='undefined'&&!!templateBase,null,{timeout:120000});await settle(p);p.errors=errors;return p}
async function setup(p,{mode='flat',template,font='Blockletter',text='FOGER',width=152,backing}={}){
  if(template){await p.selectOption('#templateChoice',template);await settle(p)}
  if(mode!=='sleeve'){await p.click('label[for='+(mode==='flat'?'exportFlat':'exportLogoOnly')+']');await settle(p)}
  if(mode==='flat'){await p.fill('#widthIn',String(width));await p.dispatchEvent('#widthIn','change')}
  await p.evaluate(async name=>{let v='system';if(name){const f=BUILTIN_FONTS.find(f=>f.name.trim()===name);v='builtin:'+f.file}await chooseBuiltin(v,true)},font);
  await p.fill('#textInput',text);await p.waitForFunction(t=>(AppState.sourceLabel||'').startsWith('text:'+t),text);await settle(p);
  if(backing){const want={Solid:'solid',None:'none'}[backing]||backing.toLowerCase();
    for(let i=0;i<3;i++){await p.click('label[for=textBacking'+backing+']');if(await p.evaluate(w=>(AppState.silhouette?AppState.textBacking:'solid')===w,want))break;await sleep(300)}await settle(p)}}
// In the page: letter-edge vertices (top corners of the wall faces that reach the bed) of a flat mesh, their distance
// to the 0.5 level of the anti-aliased text image (searched along the image gradient) and staircase runs.
const measureFlat=(p,grid,low=0)=>p.evaluate(([grid,low])=>{
  let mesh=previewMesh;
  if(grid){const b=buildHeightmapAtDetail(MC.getExportDetail(AppState.detail));const o=meshOptionsFromState(b.hm,b.rows,b.cols,b.mask);o.textRelief=null;mesh=MC.buildMesh(o)}
  const img=AppState.image,w=img.width,h=img.height,c=document.createElement('canvas');c.width=w;c.height=h;const cx=c.getContext('2d');cx.drawImage(img,0,0);const d=cx.getImageData(0,0,w,h).data;
  const lum=new Float32Array(w*h);for(let i=0;i<w*h;i++)lum[i]=(.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2])/255;
  const at=(x,y)=>{x-=.5;y-=.5;const x0=Math.max(0,Math.min(w-2,Math.floor(x))),y0=Math.max(0,Math.min(h-2,Math.floor(y))),tx=Math.max(0,Math.min(1,x-x0)),ty=Math.max(0,Math.min(1,y-y0));return (lum[y0*w+x0]*(1-tx)+lum[y0*w+x0+1]*tx)*(1-ty)+(lum[(y0+1)*w+x0]*(1-tx)+lum[(y0+1)*w+x0+1]*tx)*ty};
  const P=mesh.positions,I=mesh.indices,W=AppState.plateWidth,D=W*h/w,edge=new Set(),nb=new Map();
  for(let f=0;f<I.length;f+=3){const v=[I[f],I[f+1],I[f+2]];if(!v.some(k=>Math.abs(P[k*3+1]-low)<1e-4)||!v.some(k=>P[k*3+1]>low+1e-4))continue;const top=v.filter(k=>P[k*3+1]>low+1e-4);top.forEach(k=>edge.add(k));
    if(top.length===2){for(const [a,b] of [[top[0],top[1]],[top[1],top[0]]]){if(!nb.has(a))nb.set(a,new Set());nb.get(a).add(b)}}}
  const px=k=>[(P[k*3]/W+.5)*w,(P[k*3+2]/D+.5)*h];let max=0,sum=0,n=0;
  for(const k of edge){const [x,y]=px(k);let gx=at(x+.5,y)-at(x-.5,y),gy=at(x,y+.5)-at(x,y-.5);const gl=Math.hypot(gx,gy);let dist=4;
    if(gl>1e-6){gx/=gl;gy/=gl;const f0=at(x,y)-.5;if(f0===0)dist=0;for(let t=.02;t<=4&&dist===4;t+=.02)for(const s of [t,-t]){const f=at(x+gx*s,y+gy*s)-.5;if(f===0||(f>0)!==(f0>0)){dist=Math.max(0,Math.abs(s)-.01);break}}}
    const mm=dist*W/w;max=Math.max(max,mm);sum+=mm;n++}
  // Staircases: 3+ consecutive short axis-aligned outline segments turning by 90 degrees.
  const cell=W/160*1.5;let runs=0;const seen=new Set();
  for(const [a,set] of nb)for(const b of set){const key=a+','+b;if(seen.has(key))continue;let run=0,prev=a,cur=b,steps=0,pd=null;
    while(steps++<5000){seen.add(prev+','+cur);const dx=P[cur*3]-P[prev*3],dz=P[cur*3+2]-P[prev*3+2],len=Math.hypot(dx,dz),axis=Math.abs(dx)<1e-5?'z':Math.abs(dz)<1e-5?'x':null;
      if(axis&&len<cell&&axis!==pd){run++;if(run===3)runs++}else run=axis&&len<cell?1:0;pd=axis;const nxt=[...(nb.get(cur)||[])].find(v=>v!==prev);if(nxt===undefined||nxt===b)break;prev=cur;cur=nxt}}
  const v=MC.validateMesh(P,I);return {max,mean:sum/n,count:n,runs,tris:v.triCount,closed:!v.boundary&&!v.nonManifold&&!v.zeroArea,sharp:!!mesh.textRelief}},[grid,low]);
// Export through the real Export STL button; returns the welded mesh check of the downloaded file.
async function exportSTL(p){const [dl]=await Promise.all([p.waitForEvent('download',{timeout:120000}),p.click('#generateBtn')]);const file=await dl.path();const buf=fs.readFileSync(file);
  const n=buf.readUInt32LE(80),ids=new Map(),edges=new Map();let next=0;const id=(o)=>{const k=buf.readFloatLE(o)+','+buf.readFloatLE(o+4)+','+buf.readFloatLE(o+8);let v=ids.get(k);if(v===undefined){v=next++;ids.set(k,v)}return v};
  for(let f=0;f<n;f++){const o=84+f*50+12,v=[id(o),id(o+12),id(o+24)];for(let e=0;e<3;e++){const a=v[e],b=v[(e+1)%3],k=a<b?a+','+b:b+','+a;edges.set(k,(edges.get(k)||0)+(a<b?1:-1)*1000+1)}}
  let open=0,bad=0;for(const val of edges.values()){const count=((val%1000)+1000)%1000,dir=Math.round((val-count)/1000);if(count!==2)open++;else if(dir!==0)bad++}
  return {tris:n,bytes:buf.length,closed:open===0,wound:bad===0}}

// 1. Fonts on a 152 mm flat plate (Jason's case): letters only, the default trimmed text plate.
for(const font of ['Blockletter','Harry P','Waltograph','Cowboys',null]){
  const p=await open();const name=font||'system sans-serif';console.log('font: '+name);
  await setup(p,{font});const s=await measureFlat(p,false),g=await measureFlat(p,true);
  ok(s.sharp&&s.closed,name+': preview is closed sharp lettering ('+s.tris+' tris)');
  ok(s.max<.05,name+': letter edges within 0.05 mm of the glyph outline (max '+s.max.toFixed(3)+', mean '+s.mean.toFixed(3)+' mm, '+s.count+' points)');
  ok(s.runs===0,name+': no stair steps (grid export had '+g.runs+' runs)');
  ok(g.max>3*s.max,name+': old grid export was '+g.max.toFixed(2)+' mm off (mean '+g.mean.toFixed(2)+')');
  const stats=await p.evaluate(()=>$('statGrid').textContent+' | '+$('statQualityMode').textContent);ok(/outline/.test(stats)&&/same in export/.test(stats),name+': status bar says '+stats);
  if(shots&&font==='Harry P'){await p.evaluate(()=>{camera.position.set(0,55,48);controls.target.set(0,0,0);controls.update()});await sleep(400);await p.screenshot({path:shots+'flat-harryp.png'})}
  ok(!p.errors.length,name+': no page errors '+p.errors.join(' | '));await p.context().close()}

// 2. Every non-template shape exports the same closed mesh as its preview.
const shapes=[['flat solid plate',{backing:'Solid'}],['flat outline backing',{backing:'Outline'}],['flat rounded rectangle',{backing:'Rounded'}],['flat connector bar',{backing:'Bar'}],['flat letters only',{backing:'None'}],['logo only',{mode:'logo-only'}],
  ['parametric sleeve',{mode:'sleeve',template:'parametric'}]];
for(const [label,o] of shapes){const p=await open();console.log('shape: '+label);await setup(p,{...o,font:'Harry P'});
  const info=await p.evaluate(()=>{const v=MC.validateMesh(previewMesh.positions,previewMesh.indices);return {sharp:!!previewMesh.textRelief,error:previewMesh.textReliefError||'',tris:v.triCount,closed:!v.boundary&&!v.nonManifold&&!v.zeroArea,pieces:AppState.lastTextRelief?.pieces,tip:$('textBackingTip')?.textContent||''}});
  ok(info.sharp&&info.closed,label+': closed sharp preview ('+info.tris+' tris)'+(info.error?' error '+info.error:''));
  if(['Outline','Rounded','Bar'].includes(o.backing))ok(info.pieces===1&&/one piece/.test(info.tip),label+': one piece · '+info.tip);
  if(o.backing==='None')ok(info.pieces>1&&/separate pieces/.test(info.tip),label+': '+info.tip);
  if(o.backing&&o.backing!=='Solid')ok(await p.evaluate(()=>AppState.depthMm===2),label+': starts with 2 mm letters');
  if(o.backing){const low=o.backing==='None'?0:await p.evaluate(()=>AppState.baseThickness);const m=await measureFlat(p,false,low);ok(m.max<.05&&m.runs===0,label+': edges on the outline (max '+m.max.toFixed(3)+' mm)')}
  const e=await exportSTL(p);ok(e.closed&&e.wound,label+': exported STL closed and consistently wound');if(o.backing)ok(e.tris===info.tris,label+': export is the preview mesh ('+e.tris+' tris, '+(e.bytes/1024).toFixed(0)+' KB)');
  else{const x=await p.evaluate(()=>{const m=buildExportMesh();return {sharp:!!m.textRelief,tris:m.indices.length/3}});
    ok(x.sharp&&x.tris===e.tris,label+': export has the same sharp lettering on the export-detail body ('+e.tris+' tris, '+(e.bytes/1024).toFixed(0)+' KB)')}
  ok(!p.errors.length,label+': no page errors '+p.errors.join(' | '));await p.context().close()}

// 3. Letter spacing and thickness still shape the lettering.
{const p=await open();console.log('spacing / thickness');await setup(p,{text:'FOG'});
 const span=()=>p.evaluate(()=>{const P=previewMesh.positions;let a=Infinity,b=-Infinity,area=0;for(let i=0;i<P.length;i+=3){a=Math.min(a,P[i]);b=Math.max(b,P[i])}return b-a});
 const w0=await span();await p.fill('#letterSpacingIn','40');await p.dispatchEvent('#letterSpacingIn','input');await p.waitForFunction(()=>AppState.letterSpacing===40);await settle(p);await sleep(800);await settle(p);const w1=await span();
 ok(w1>w0+5,'letter spacing widens the lettering ('+w0.toFixed(1)+' -> '+w1.toFixed(1)+' mm)');
 const before=await measureFlat(p,false);await p.fill('#letterThicknessIn','8');await p.dispatchEvent('#letterThicknessIn','input');await p.waitForFunction(()=>AppState.letterThickness===8);await settle(p);await sleep(800);await settle(p);
 const after=await measureFlat(p,false);const vol=await p.evaluate(()=>previewMesh.textRelief);
 ok(vol&&after.closed&&after.max<.05&&after.runs===0,'thicker letters stay sharp and closed (max '+after.max.toFixed(3)+' mm)');
 ok(!p.errors.length,'spacing/thickness: no page errors '+p.errors.join(' | '));await p.context().close()}

// 4. Image designs never take the lettering path; sleeve templates keep their contour pipeline.
{const p=await open();console.log('templates and images');await setup(p,{mode:'sleeve'});
 ok(await p.evaluate(()=>templateActive()&&textReliefOptions()===null),'ETSYFOLGER template keeps its own contour path for text');
 await p.click('label[for=exportFlat]');await settle(p);
 await p.evaluate(()=>new Promise(r=>{const c=document.createElement('canvas');c.width=400;c.height=200;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,400,200);x.fillStyle='#000';x.beginPath();x.arc(200,100,70,0,7);x.fill();const im=new Image();im.onload=()=>{setDesignImage(im,'logo.png');r()};im.src=c.toDataURL()}));await settle(p);
 ok(await p.evaluate(()=>!previewMesh.textRelief&&textReliefOptions()===null),'an image design uses the unchanged grid mesh');
 ok(!p.errors.length,'templates/images: no page errors '+p.errors.join(' | '));await p.context().close()}

// 5. Text-print defaults come and go with the flat plate; the uniform scale slider resizes the template design.
{const p=await open();console.log('defaults and uniform scale');await setup(p,{mode:'sleeve'});
 const d0=await p.evaluate(()=>AppState.depthMm);
 await p.click('label[for=exportFlat]');await settle(p);
 ok(await p.evaluate(()=>AppState.depthMm===2&&AppState.relief==='raised'&&!$('textBackingField').hidden),'flat text starts at 2 mm letters with the backing choices shown');
 await p.click('label[for=exportSleeve]');await settle(p);
 ok(await p.evaluate(d0=>AppState.depthMm===d0&&$('textBackingField').hidden,d0),'back on the sleeve the relief depth returns to '+d0+' mm');
 ok(await p.evaluate(()=>!$('uniformScaleField').hidden),'uniform scale is shown under the sizing sliders');
 const w0=await p.evaluate(()=>[AppState.designWidth,AppState.designHeight]);
 await p.fill('#uniformScaleRange','120');await p.dispatchEvent('#uniformScaleRange','input');await p.dispatchEvent('#uniformScaleRange','change');await settle(p);
 const w1=await p.evaluate(()=>[AppState.designWidth,AppState.designHeight,$('uniformScaleVal').textContent]);
 ok(Math.abs(w1[0]/w0[0]-1.2)<.02&&Math.abs(w1[1]/w0[1]-1.2)<.02,'120% scales width and height together ('+w0.map(v=>v.toFixed(1)).join('x')+' -> '+w1.slice(0,2).map(v=>v.toFixed(1)).join('x')+', '+w1[2]+')');
 await p.evaluate(()=>undoEdit());await settle(p);
 ok(await p.evaluate(w0=>$('uniformScaleRange').value==='100'&&Math.abs(AppState.designWidth-w0[0])<.01,w0),'undo restores the size and the slider rests at 100% again');
 ok(!p.errors.length,'defaults/scale: no page errors '+p.errors.join(' | '));await p.context().close()}

await browser.close();console.log(`\ntext relief e2e: ${passes} passed, ${failures} failed`);process.exit(failures?1:0);
