// Offline/PWA checks: worker registers, app shell is cached and verified, the app reloads offline, a valid update
// is offered and applied, and an update whose files do not match its hashes is refused (no mixed versions).
// usage: node pwa-e2e.mjs <distDir | https URL>
//   distDir: serves a temporary copy over http (with ?sw=1) and also tests updates by rewriting sw.js on disk.
//   URL: a deployed HTTPS site; registration, precache, manifest and offline reload only.
import {chromium,devices} from 'playwright-core';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
const arg=process.argv[2]||'../dist';const local=!/^https?:/.test(arg);let base=arg,root=null,server=null;
if(local){root=fs.mkdtempSync(path.join(os.tmpdir(),'caviot-pwa-'));fs.cpSync(arg,root,{recursive:true});
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
  server=http.createServer((req,res)=>{const u=decodeURIComponent(new URL(req.url,'http://x').pathname);const f=path.join(root,u.endsWith('/')?u+'index.html':u);if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(f).pipe(res)});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port+'/';}
base=base.replace(/\/?$/,'/');
const url=base+(local?'?sw=1':'');
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let failures=0,passes=0;const ok=(cond,msg)=>{if(cond){passes++;console.log('  PASS',msg)}else{failures++;console.log('  FAIL',msg)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ctx=await browser.newContext({...devices['Pixel 7'],serviceWorkers:'allow'});const p=await ctx.newPage();const errors=[];
p.on('pageerror',e=>errors.push('pageerror: '+e.message));p.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
await p.goto(url,{waitUntil:'load'});
const version=()=>p.evaluate(()=>new Promise(res=>{const ch=new MessageChannel();ch.port1.onmessage=e=>res(e.data.version);navigator.serviceWorker.controller.postMessage({type:'VERSION'},[ch.port2]);setTimeout(()=>res(null),3000)}));
await p.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:120000});
ok(true,'service worker registered and controls the page');
const cached=await p.evaluate(async()=>{const c=await caches.open('caviot-files-v1');return (await c.keys()).length});
ok(cached>=60,'app shell precached and hash-verified ('+cached+' files)');
const v1=await version();ok(!!v1,'worker version '+v1);
const manifest=await p.evaluate(async()=>{const r=await fetch(document.querySelector('link[rel=manifest]').href);const m=await r.json();const icons=await Promise.all(m.icons.map(async i=>(await fetch(new URL(i.src,location.href))).ok));return {name:m.name,display:m.display,icons:icons.every(Boolean)&&icons.length}});
ok(manifest.name==='Caviot Studio'&&manifest.display==='standalone'&&manifest.icons>=3,'manifest '+JSON.stringify(manifest));
// Offline reload: the whole app, the sleeve template and the default font come from the cache.
await ctx.setOffline(true);await p.reload({waitUntil:'load'});
await p.waitForFunction(()=>typeof templateBase!=='undefined'&&!!templateBase,null,{timeout:60000}).catch(()=>{});
const off=await p.evaluate(()=>({title:document.title,template:!!templateBase,controlled:!!navigator.serviceWorker.controller}));
ok(off.template&&/Caviot Studio/.test(off.title),'offline reload works '+JSON.stringify(off));
await sleep(3000);
const offErr=errors.filter(e=>!/willReadFrequently/.test(e));ok(!offErr.length,'no errors offline '+JSON.stringify(offErr.slice(0,3)));
await ctx.setOffline(false);errors.length=0;
if(local){
// A real update (new sw.js on the server): the page offers Reload, then runs the new version.
const swPath=path.join(root,'sw.js'),swText=fs.readFileSync(swPath,'utf8');
fs.writeFileSync(swPath,swText.replace(/const VERSION='[^']+'/,"const VERSION='e2e-update'"));
await p.evaluate(()=>CaviotPWA.registration.update());
await p.waitForFunction(()=>!document.querySelector('.update-banner').hidden,null,{timeout:60000}).catch(()=>{});
ok(await p.evaluate(()=>!document.querySelector('.update-banner').hidden),'update banner offered');
ok((await version())===v1,'old version keeps serving until Reload');
const nav=p.waitForNavigation({timeout:60000}).catch(()=>null);await p.click('.update-banner [data-update="now"]');await nav;
await p.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:60000});await sleep(500);
ok((await version())==='e2e-update','page reloaded onto the new version');
// A mixed deploy: sw.js expects new bytes for mobile.css but the server still has the old file -> refused.
fs.writeFileSync(swPath,swText.replace(/const VERSION='[^']+'/,"const VERSION='e2e-mixed'").replace(/"mobile\.css":"[0-9a-f]{16}"/,'"mobile.css":"0000000000000000"'));
const outcome=await p.evaluate(()=>new Promise(res=>{const reg=CaviotPWA.registration;reg.addEventListener('updatefound',()=>{const w=reg.installing;w.addEventListener('statechange',()=>{if(w.state==='redundant'||w.state==='installed')res(w.state)})});reg.update().catch(e=>res('update error '+e.message));setTimeout(()=>res('timeout'),60000)}));
ok(outcome==='redundant','mismatched update refused ('+outcome+')');
ok((await version())==='e2e-update'&&await p.evaluate(()=>document.querySelector('.update-banner').hidden),'still on the last good version, no banner');
}
const real=errors.filter(e=>!/willReadFrequently/.test(e));ok(!real.length,'no console/page errors '+JSON.stringify(real.slice(0,3)));
// Leave nothing behind for other local runs.
await p.evaluate(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k)});
await browser.close();if(server){server.close();fs.rmSync(root,{recursive:true,force:true})}console.log(`\npwa e2e: ${passes} passed, ${failures} failed`);process.exit(failures?1:0);
