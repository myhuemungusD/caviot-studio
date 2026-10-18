// usage: node e2e/native-labels-e2e.mjs <url> [shotsDir]
// Web mode keeps "Foger Sleeve" and every preset. Phone-app mode (the build flag the iOS/Android copy sets, and
// a Capacitor native platform) shows "Classic Sleeve", no vape presets or wording, and exports identical STL bytes.
import {chromium,devices} from 'playwright-core';import fs from 'node:fs';import crypto from 'node:crypto';
const base=(process.argv[2]||'http://127.0.0.1:4173/').replace(/\/?$/,'/');const shots=process.argv[3]||'';if(shots)fs.mkdirSync(shots,{recursive:true});
const IMAGE=new URL('./fixtures/badge.png',import.meta.url).pathname;
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  PASS ':'  FAIL ')+m)};
const BAD=/vape|vaping|foger|fogger|geek ?bar|tobacco|nicotine|smok/i;
const modes={web:null,flag:()=>{window.CAVIOT_NEUTRAL_LABELS=true},capacitor:()=>{window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios'}}};
async function settle(p,ms=180000){const t=Date.now();await sleep(300);while(Date.now()-t<ms){if(await p.evaluate(()=>typeof templatePreviewRunning!=='undefined'&&!!templateBase&&!templatePreviewRunning&&!templatePending&&!placementTimer&&!AppState.rebuildTimer&&!exportBusy))return true;await sleep(250)}return false}
async function open(mode,opts){const ctx=await browser.newContext({...opts,acceptDownloads:true});if(modes[mode])await ctx.addInitScript(modes[mode]);const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base,{waitUntil:'load'});await p.waitForFunction(()=>typeof templateBase!=='undefined'&&!!templateBase,null,{timeout:120000});
  // Phone apps open on "Choose a template" (empty-start.js); pick Classic Sleeve like a user would.
  if(await p.evaluate(()=>typeof CaviotEmptyStart!=='undefined'&&CaviotEmptyStart.active)){await p.click('#emptyStartClassic');await p.waitForFunction(()=>!CaviotEmptyStart.active,null,{timeout:60000})}
  await settle(p);return{ctx,p,errors}}
const visibleText=p=>p.evaluate(()=>{const parts=[document.title,document.body.textContent];for(const e of document.querySelectorAll('*'))for(const a of ['title','aria-label','label','placeholder','alt'])if(e.getAttribute(a))parts.push(e.getAttribute(a));return parts.join('\n')});
const hashes={};
for(const mode of Object.keys(modes)){
  console.log(mode);
  // Phone UI: wording and presets.
  {const {ctx,p,errors}=await open(mode,{...devices['iPhone 14']});
    const info=await p.evaluate(()=>({native:CaviotLabels.native,label:templateInfo().label,file:templateInfo().file,toolbar:document.querySelector('#templateToolbar span').textContent,
      option:document.querySelector('#templateChoice option[value="etsyfolger-v1"]').textContent,presets:[...document.querySelectorAll('#lighterChoice option')].map(o=>o.value),
      groups:[...document.querySelectorAll('#lighterChoice optgroup')].map(g=>g.label),tip:document.getElementById('devicePresetTip').textContent.trim()}));
    const text=await visibleText(p);const bad=text.match(new RegExp(BAD.source,'gi'))||[];
    if(mode==='web'){ok(!info.native&&info.label==='Foger Sleeve'&&info.toolbar==='Foger Sleeve'&&/Foger Sleeve/.test(info.option),'web shows Foger Sleeve '+JSON.stringify([info.label,info.toolbar,info.option]));
      ok(info.groups.some(g=>/Vapes/.test(g))&&info.presets.includes('foger-switch-pro')&&info.presets.includes('geek-bar-pulse'),'web keeps every device preset');}
    else{ok(info.native&&info.label==='Classic Sleeve'&&info.file==='Classic-Sleeve'&&info.toolbar==='Classic Sleeve'&&/Classic Sleeve/.test(info.option),'phone app shows Classic Sleeve '+JSON.stringify([info.label,info.toolbar,info.option]));
      ok(!info.groups.some(g=>BAD.test(g))&&!info.presets.some(v=>/geek|foger/.test(v))&&info.presets.includes('bic-template')&&info.presets.includes('custom'),'phone app: vape presets hidden, others kept '+JSON.stringify(info.groups));
      ok(!BAD.test(info.tip),'phone app: neutral preset tip "'+info.tip+'"');
      ok(bad.length===0,'phone app: no vape/Foger wording anywhere in the page '+JSON.stringify([...new Set(bad)]));
      const guide=await p.evaluate(()=>document.querySelector('.product-dialog')?.textContent||'');ok(guide.length>100&&!BAD.test(guide)&&/Classic Sleeve/.test(guide),'phone app: maker guide says Classic Sleeve');}
    if(shots){await p.screenshot({path:`${shots}/${mode}-phone-main.png`});
      await p.evaluate(({mode})=>{const box=document.createElement('div');box.id='shotOverlay';box.style.cssText='position:fixed;inset:auto 8px 8px 8px;z-index:99999;background:#fff;color:#111;font:13px/1.35 system-ui;padding:10px;border-radius:10px;max-height:70vh;overflow:auto;box-shadow:0 4px 20px #0008';
        const sel=document.getElementById('lighterChoice');let h='<b>'+(mode==='web'?'Website':'Phone app')+' — Sleeve template:</b> '+document.querySelector('#templateChoice option[value="etsyfolger-v1"]').textContent+'<br><b>Size &amp; fit presets</b><br>';
        for(const node of sel.children){if(node.tagName==='OPTGROUP'){h+='<i>'+node.label+'</i><br>';for(const o of node.children)h+='&nbsp;&nbsp;'+o.textContent+'<br>'}else h+=node.textContent+'<br>'}
        h+='<small>'+document.getElementById('devicePresetTip').textContent.trim()+'</small>';box.innerHTML=h;document.body.append(box)},{mode});
      await p.screenshot({path:`${shots}/${mode}-phone-presets.png`});}
    ok(errors.length===0,'no page errors '+JSON.stringify(errors));await ctx.close();}
  // Desktop-size export: identical STL bytes in every mode, only the file name differs.
  {const {ctx,p}=await open(mode,{viewport:{width:1440,height:900}});const r={};
    for(const step of ['plain','emboss']){if(step==='emboss'){await p.setInputFiles('#fileInput',IMAGE);await p.waitForFunction(()=>!!AppState.image,null,{timeout:30000});await settle(p)}
      const dl=p.waitForEvent('download',{timeout:600000}).catch(()=>null);await p.click('#generateBtn');const d=await dl;
      r[step]=d?crypto.createHash('sha256').update(fs.readFileSync(await d.path())).digest('hex').slice(0,16):null;r[step+'Name']=d?.suggestedFilename();await settle(p)}
    hashes[mode]=r;ok(r.plain&&r.emboss&&(mode==='web'?/Foger-Sleeve/.test(r.plainName):/Classic-Sleeve/.test(r.plainName)&&!BAD.test(r.plainName)),mode+' export '+JSON.stringify(r));await ctx.close();}
}
ok(hashes.flag.plain===hashes.web.plain&&hashes.capacitor.plain===hashes.web.plain&&hashes.flag.emboss===hashes.web.emboss&&hashes.capacitor.emboss===hashes.web.emboss,'export bytes identical in web and phone-app modes (plain '+hashes.web.plain+', emboss '+hashes.web.emboss+')');
await browser.close();console.log(`native labels e2e: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
