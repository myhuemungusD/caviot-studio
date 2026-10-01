// Mobile + PWA: device tiers, phone mesh limits in the worker, the offline worker's hash checks, and wiring.
import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {render,manifest} from './build-sw.mjs';
const dist=new URL('./dist/',import.meta.url),read=f=>fs.readFileSync(new URL(f,dist));
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('ok -',name)};

await test('dist/sw.js is current (run node build-sw.mjs after changing dist/)',()=>{
  assert.equal(read('sw.js').toString(),render(),'dist/sw.js is stale: run node build-sw.mjs');
  const m=manifest();for(const must of ['index.html','mobile.js','mobile.css','device-tier.js','pwa.js','manifest.webmanifest','vendor/three.min.js','templates/ETSYFOLGER-preview.mesh','fonts/catalog.js','fonts/Blockletter-0ca48c09.otf'])assert(m.precache.includes(must),must+' precached');
  assert(!m.precache.includes('templates/ETSYFOLGER-print.mesh')&&m.files['templates/ETSYFOLGER-print.mesh'],'print surface on demand but versioned');
  assert(!m.precache.some(p=>/^fonts\/.+\.ttf$/.test(p)),'fonts on demand');
});
await test('manifest, icons and page wiring',()=>{
  const m=JSON.parse(read('manifest.webmanifest'));assert.equal(m.name,'Caviot Studio');assert.equal(m.display,'standalone');assert.equal(m.start_url,'./');
  for(const icon of m.icons){const png=read(icon.src);assert.equal(png.readUInt32BE(0),0x89504e47);const [w,h]=icon.sizes.split('x').map(Number);assert.equal(png.readUInt32BE(16),w);assert.equal(png.readUInt32BE(20),h);}
  assert(m.icons.some(i=>i.purpose==='maskable'));
  const html=read('index.html').toString();
  assert.match(html,/name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.match(html,/<link rel="manifest" href="manifest.webmanifest"/);assert.match(html,/apple-touch-icon/);
  assert.match(html,/id="fileInput" accept="image\/\*"/);
  const order=['device-tier.js','vendor/three.min.js','three-preview.js','tool-layout.js','mobile.js','pwa.js'].map(f=>html.indexOf('<script src="'+f+'"'));
  assert(order.every((v,i)=>v>0&&(i===0||v>order[i-1])),'script order '+order);
  assert(html.indexOf('mobile.css')>html.indexOf('template.css'),'mobile.css loads last');
});
await test('device tiers: phones and low-memory devices get phone-safe limits, desktop and iPad stay full',()=>{
  const src=read('device-tier.js').toString();
  const run=({ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36',touch=0,mobile,memory,w=1920,h=1080,coarse=false,search='',stored=null,platform='Win32'})=>{
    const nav={userAgent:ua,maxTouchPoints:touch,platform,...(memory!==undefined?{deviceMemory:memory}:{}),...(mobile!==undefined?{userAgentData:{mobile}}:{})};
    const c={navigator:nav,window:{screen:{width:w,height:h},innerWidth:w,innerHeight:h,location:{search},localStorage:{getItem:()=>stored},matchMedia:q=>({matches:/pointer: coarse/.test(q)?coarse:false})},document:{documentElement:{classList:{toggle(){}},dataset:{}}},URLSearchParams};
    vm.createContext(c);vm.runInContext(src+';globalThis.out=CaviotDevice',c);return c.out;};
  assert.equal(run({}).tier,'full');assert.equal(run({memory:8}).tier,'full');
  const iphone=run({ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',touch:5,w:390,h:844,coarse:true,platform:'iPhone'});
  assert.equal(iphone.tier,'light');assert.equal(iphone.iOS,true);assert.equal(iphone.limits.exportSpacing,.2);
  assert.equal(run({ua:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1',touch:5,w:820,h:1180,coarse:true,mobile:true}).tier,'full','iPad');
  assert.equal(run({ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15',platform:'MacIntel',touch:5,w:1024,h:1366,coarse:true}).iOS,true,'iPadOS desktop UA is iOS');
  assert.equal(run({ua:'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/140 Mobile Safari/537.36',mobile:true,touch:5,w:412,h:915,memory:8}).tier,'light','Android phone');
  assert.equal(run({ua:'Mozilla/5.0 (Linux; Android 14) Chrome/140 Safari/537.36',mobile:false,touch:5,w:800,h:1280,memory:4}).tier,'light','4 GB Android tablet');
  assert.equal(run({memory:2}).tier,'light','2 GB laptop');
  assert.equal(run({mobile:true,touch:5,w:390,h:844,search:'?tier=full'}).tier,'full','URL override');
  assert.equal(run({mobile:true,touch:5,w:390,h:844,stored:'full'}).tier,'full','user chose Full quality');
  assert.equal(run({search:'?tier=light'}).tier,'light');
  const L=run({}).LIMITS;assert.equal(L.full.meshBudget,1400000);assert.equal(L.full.exportSpacing,.14);assert(L.light.meshBudget<L.full.meshBudget);
});
await test('worker: phone limits change spacing, budget and surface; desktop jobs are unchanged',async()=>{
  const replies=[];const c={console,Blob,Response,DecompressionStream,TextDecoder,performance,postMessage:m=>replies.push(m)};c.self=c;c.globalThis=c;
  c.fetch=async u=>new Response(read(u));vm.createContext(c);c.importScripts=(...f)=>f.forEach(n=>vm.runInContext(read(n).toString(),c,{filename:n}));
  vm.runInContext(read('template-worker.js').toString(),c);
  const rows=40,cols=80,hm=Float32Array.from({length:rows*cols},(_,i)=>{const x=i%cols,y=Math.floor(i/cols);return x>8&&x<72&&y>6&&y<34&&!((x-40)**2+(y-20)**2<64)?1:0});
  const job=async(type,extra={})=>{replies.length=0;await c.onmessage({data:{type,id:1,format:'stl',repair:false,options:{sharp:true,maxHeight:.4,negative:true,designs:[{heightmap:hm,rows,cols,designWidth:30,designHeight:15,designAngle:0,designY:44.5,designRotation:0,maxHeight:.4,negative:true,sharp:true}],...extra}}});const m=replies.find(r=>!r.progress);assert(!m.error,m.error);return m};
  const pDesk=await job('preview'),pPhone=await job('preview',{previewSpacing:.3});
  assert.equal(pDesk.info.spacing,.24);assert.equal(pPhone.info.spacing,.3);assert(pPhone.indices.length<pDesk.indices.length);
  const phone=await job('export',{exportSpacing:.2,meshBudget:900000,exportSurface:'preview'});
  assert.equal(phone.info.spacing,.2);assert.deepEqual([phone.validation.boundary,phone.validation.nonManifold,phone.validation.zeroArea],[0,0,0]);
  assert(phone.validation.triCount<600000,'phone export is light: '+phone.validation.triCount);if(process.env.TB)console.log('phone verts~',phone.validation.triCount/2);
  const tight=await job('export',{exportSpacing:.2,meshBudget:Number(process.env.TB||160000),exportSurface:'preview'});
  assert(tight.info.adapted&&tight.info.spacing>.2,'a tight budget coarsens the outline spacing instead of failing');
  assert.deepEqual([tight.validation.boundary,tight.validation.nonManifold],[0,0]);
});
await test('offline worker: verified precache, refuses mismatched files, serves cached bytes',async()=>{
  const src=read('sw.js').toString(),{files,precache}=manifest();
  const make=(serverOverride={})=>{const store=new Map(),listeners={},net=[];
    const cache={match:async k=>store.get(typeof k==='string'?k:k.url)?.clone(),put:async(k,r)=>{store.set(typeof k==='string'?k:k.url,r)},keys:async()=>[...store.keys()].map(url=>({url})),delete:async k=>store.delete(k.url||k)};
    const c={URL,Response,Headers,Uint8Array,Array,Object,Promise,Error,TextEncoder,console,setTimeout,crypto:{subtle:crypto.webcrypto.subtle},
      self:{registration:{scope:'https://studio.test/',update:async()=>{}},clients:{claim:async()=>{}},skipWaiting(){},addEventListener:(t,f)=>listeners[t]=f},
      caches:{open:async()=>cache,keys:async()=>['caviot-files-v1','caviot-old'],delete:async()=>true},
      fetch:async u=>{const p=new URL(u).pathname.slice(1);net.push(p);if(serverOverride[p])return new Response(serverOverride[p]);return new Response(read(p))}};
    c.addEventListener=c.self.addEventListener;vm.createContext(c);vm.runInContext(src,c);return {c,store,listeners,net};};
  const ok=make();let wait;ok.listeners.install({waitUntil:p=>wait=p});await wait;
  assert.equal(ok.store.size,precache.length,'every precache file stored');
  for(const key of ok.store.keys())assert.match(key,/\?__v=[0-9a-f]{16}$/);
  // Fetching a cached file uses the cache only; a navigation returns index.html.
  ok.net.length=0;let res;ok.listeners.fetch({request:{url:'https://studio.test/?tier=light',method:'GET',mode:'navigate',headers:{has:()=>false}},respondWith:p=>res=p});
  assert.equal(Buffer.from(await (await res).arrayBuffer()).toString(),read('index.html').toString());assert.equal(ok.net.length,0);
  // On-demand file (print surface) is fetched once, verified and cached.
  ok.listeners.fetch({request:{url:'https://studio.test/templates/ETSYFOLGER-print.mesh',method:'GET',mode:'cors',headers:{has:()=>false}},respondWith:p=>res=p});
  assert.equal((await (await res).arrayBuffer()).byteLength,read('templates/ETSYFOLGER-print.mesh').length);assert(ok.net.includes('templates/ETSYFOLGER-print.mesh'));
  // Unknown and cross-origin requests are left to the network.
  let touched=false;ok.listeners.fetch({request:{url:'https://cdn.other/x.js',method:'GET',mode:'cors',headers:{has:()=>false}},respondWith:()=>touched=true});assert(!touched);
  // A server file that does not match the worker's hash fails the install (no mixed versions).
  const bad=make({'mobile.css':'/* other version */'});bad.listeners.install({waitUntil:p=>wait=p});
  await assert.rejects(wait,/another version/);
  // Activation removes other caviot caches and stale entries.
  ok.store.set('https://studio.test/old.js?__v=deadbeefdeadbeef',new Response('x'));ok.listeners.activate({waitUntil:p=>wait=p});await wait;
  assert(![...ok.store.keys()].some(k=>k.includes('old.js')));
});
await test('serve.mjs knows the PWA file types',()=>{const s=fs.readFileSync(new URL('./serve.mjs',import.meta.url),'utf8');assert.match(s,/'\.webmanifest':'application\/manifest\+json'/)});
console.log(passed+' mobile/PWA checks passed');
