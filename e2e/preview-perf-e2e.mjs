// usage: node e2e/preview-perf-e2e.mjs <baseURL> [otherURL]
// Before/after preview benchmark: Pixel 7 profile, 4x CPU throttle, SwiftShader GPU (software, so absolute
// fps are pessimistic; the before/after difference is what matters).
import {chromium,devices} from 'playwright-core';
const urls=process.argv.slice(2);
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-vsync','--disable-frame-rate-limit']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function settle(p,ms=180000){const t=Date.now();await sleep(300);while(Date.now()-t<ms){if(await p.evaluate(()=>!!templateBase&&!templatePreviewRunning&&!templatePending&&!placementTimer&&!AppState.rebuildTimer&&!exportBusy))return;await sleep(250)}}
for(const url of urls){
  const ctx=await browser.newContext({...devices['Pixel 7']}),p=await ctx.newPage();const cdp=await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const t0=Date.now();await p.goto(url,{waitUntil:'load'});
  await p.waitForFunction(()=>typeof templateBase!=='undefined'&&!!templateBase,null,{timeout:180000});const ready=Date.now()-t0;await settle(p);
  const r=await p.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const stats=d=>{const s=[...d].sort((a,b)=>a-b),q=x=>+s[Math.min(s.length-1,Math.floor(s.length*x))].toFixed(1);const tot=d.reduce((a,b)=>a+b,0);return{fps:+(d.length/(tot/1000)).toFixed(1),p50:q(.5),p95:q(.95),over33:d.filter(x=>x>33.4).length}};
    // idle: count WebGL draws and main-thread busy time over 4 s
    const f0=renderer.info.render.frame;let busy=0,last=performance.now(),n=0;
    await new Promise(res=>{const tick=now=>{n++;if(now-last>0)busy+=0;last=now;if(n<240)requestAnimationFrame(tick);else res()};requestAnimationFrame(tick)});
    const idleFrames=n;const idleDraws=renderer.info.render.frame-f0;
    // orbit 4 s
    const tgt=controls.target.clone(),off=camera.position.clone().sub(tgt),ax=new THREE.Vector3(0,1,0),d=[];let l=performance.now();const s0=l;
    await new Promise(res=>{const st=now=>{d.push(now-l);l=now;off.applyAxisAngle(ax,.03);camera.position.copy(tgt).add(off);camera.lookAt(tgt);window.requestPreviewRender&&requestPreviewRender(200);if(now-s0<4000)requestAnimationFrame(st);else res()};requestAnimationFrame(st)});
    // slider drag 3 s
    const sl=[...document.querySelectorAll('input[type=range]')].find(e=>!e.disabled);const h=[],sd=[];let i=0;l=performance.now();const s1=l;const mn=+sl.min,mx=+sl.max,orig=sl.value;
    await new Promise(res=>{const st=now=>{sd.push(now-l);l=now;sl.value=String(mn+((Math.sin(i++/10)+1)/2)*(mx-mn));const a=performance.now();sl.dispatchEvent(new Event('input',{bubbles:true}));h.push(performance.now()-a);if(now-s1<3000)requestAnimationFrame(st);else res()};requestAnimationFrame(st)});
    sl.value=orig;sl.dispatchEvent(new Event('input',{bubbles:true}));h.sort((a,b)=>a-b);
    return{idleDrawsPerFrame:+(idleDraws/idleFrames).toFixed(2),orbit:stats(d.slice(3)),slider:{id:sl.id,...stats(sd.slice(3)),handlerP95:+h[Math.floor(h.length*.95)].toFixed(2)},dpr:devicePixelRatio,buffer:renderer.domElement.width+'x'+renderer.domElement.height};
  });
  // idle CPU: Performance metrics TaskDuration over 5 s idle
  await settle(p);await cdp.send('Performance.enable');const m0=(await cdp.send('Performance.getMetrics')).metrics;await sleep(5000);const m1=(await cdp.send('Performance.getMetrics')).metrics;
  const g=(m,k)=>m.find(x=>x.name===k).value;r.idleMainThreadPct=+(100*(g(m1,'TaskDuration')-g(m0,'TaskDuration'))/5).toFixed(1);
  console.log(url,JSON.stringify({templateReadyMs:ready,...r}));await ctx.close();
}
await browser.close();
