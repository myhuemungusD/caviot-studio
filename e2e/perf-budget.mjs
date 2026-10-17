// Performance budget. usage: node e2e/perf-budget.mjs <url> [--runs N] [--baseline perf/baseline.json] [--out result.json]
// Fresh browser context per run; reports the median of N runs for each metric and fails if any median is more
// than 15% (plus a small absolute allowance for tiny numbers) above the stored baseline. Lower is better for all.
//   ttiMs          navigation -> default sleeve loaded and the preview settled (interactive)
//   orbitP95Ms     95th percentile frame time during a scripted 4 s camera orbit
//   sliderMs       median time from a depth-slider change (with a logo) to the rebuilt preview being shown
//   exportMs       default plain sleeve: Export STL click -> download ready
import {chromium} from 'playwright-core';import fs from 'node:fs';
const args=process.argv.slice(2);const url=(args.find(a=>!a.startsWith('--')&&!/^\d+$/.test(a)&&!a.endsWith('.json'))||'http://127.0.0.1:4173/').replace(/\/?$/,'/');
const opt=(k,d)=>{const i=args.indexOf('--'+k);return i>=0?args[i+1]:d};const RUNS=+opt('runs',5),BASE=opt('baseline',''),OUT=opt('out','');
const TOL=0.15,FLOOR={ttiMs:150,orbitP95Ms:3,sliderMs:60,exportMs:250};
const IMAGE=new URL('./fixtures/badge.png',import.meta.url).pathname;
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-vsync','--disable-frame-rate-limit']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const settledFn=()=>typeof templatePreviewRunning!=='undefined'&&!!templateBase&&!document.getElementById('generateBtn').disabled&&!templatePreviewRunning&&!templatePending&&!placementTimer&&!AppState.rebuildTimer&&!exportBusy;
async function settle(p,ms=180000){const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(settledFn))return true;await sleep(50)}throw Error('preview did not settle')}
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
const runs=[];
for(let run=0;run<RUNS;run++){
  const ctx=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true}),p=await ctx.newPage();
  const t0=Date.now();await p.goto(url,{waitUntil:'load'});
  await p.waitForFunction(settledFn,null,{timeout:180000,polling:50});const ttiMs=Date.now()-t0;
  await sleep(500);
  const orbitP95Ms=await p.evaluate(async()=>{const tgt=controls.target.clone(),off=camera.position.clone().sub(tgt),ax=new THREE.Vector3(0,1,0),d=[];let l=performance.now();const s0=l;
    await new Promise(res=>{const st=now=>{d.push(now-l);l=now;off.applyAxisAngle(ax,.03);camera.position.copy(tgt).add(off);camera.lookAt(tgt);window.requestPreviewRender&&requestPreviewRender(200);if(now-s0<4000)requestAnimationFrame(st);else res()};requestAnimationFrame(st)});
    const s=d.slice(5).sort((a,b)=>a-b);return +s[Math.floor(s.length*.95)].toFixed(2)});
  // default export (plain sleeve)
  let t=Date.now();const dl=p.waitForEvent('download',{timeout:600000});await p.click('#generateBtn');const d=await dl;await d.path();const exportMs=Date.now()-t;await settle(p);
  // slider response with a logo on the sleeve
  await ctx.close();const ctx2=await browser.newContext({viewport:{width:1440,height:900}});const p2=await ctx2.newPage();await p2.goto(url,{waitUntil:'load'});await p2.waitForFunction(settledFn,null,{timeout:180000,polling:50});
  await p2.setInputFiles('#fileInput',IMAGE);await p2.waitForFunction(()=>!!AppState.image,null,{timeout:30000});await settle(p2);
  const sl=[];for(const v of ['0.8','1.2','0.6','1.0','0.5']){t=Date.now();
    await p2.evaluate(v=>{const e=document.getElementById('depthIn');e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))},v);
    await sleep(30);await settle(p2);await p2.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));sl.push(Date.now()-t)}
  const r={ttiMs,orbitP95Ms,sliderMs:median(sl),exportMs};runs.push(r);console.log('run '+(run+1)+': '+JSON.stringify(r));await ctx2.close();
}
await browser.close();
const result={runs:RUNS,median:Object.fromEntries(Object.keys(runs[0]).map(k=>[k,+median(runs.map(r=>r[k])).toFixed(2)])),all:runs};
console.log('median: '+JSON.stringify(result.median));if(OUT)fs.writeFileSync(OUT,JSON.stringify(result,null,2)+'\n');
let failed=0;const lines=['| metric | baseline | now | limit | |','|---|---|---|---|---|'];
if(BASE&&fs.existsSync(BASE)){const base=JSON.parse(fs.readFileSync(BASE,'utf8')).median;
  for(const k of Object.keys(result.median)){const b=base[k];if(b==null){lines.push(`| ${k} | – | ${result.median[k]} | – | new |`);continue}
    const limit=+(Math.max(b*(1+TOL),b+FLOOR[k])).toFixed(2),bad=result.median[k]>limit;failed+=bad;lines.push(`| ${k} | ${b} | ${result.median[k]} | ${limit} | ${bad?'❌ over budget':'✅'} |`)}}
else lines.push('| (no baseline file; nothing compared) | | | | |');
console.log(lines.join('\n'));if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Performance budget (median of '+RUNS+' runs)\n\n'+lines.join('\n')+'\n');
process.exit(failed?1:0);
