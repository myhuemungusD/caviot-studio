// usage: node e2e/export-parity-e2e.mjs <baseURL> <branchURL>  (plain / image emboss / image deboss STL sha256 prefixes)
import {chromium} from 'playwright-core';import fs from 'node:fs';import crypto from 'node:crypto';
const urls=process.argv.slice(2);const IMAGE=new URL('./fixtures/badge.png', import.meta.url).pathname;
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function settle(p,ms=180000){const t=Date.now();await sleep(300);while(Date.now()-t<ms){if(await p.evaluate(()=>typeof templatePreviewRunning!=='undefined'&&!!templateBase&&!templatePreviewRunning&&!templatePending&&!placementTimer&&!AppState.rebuildTimer&&!exportBusy))return true;await sleep(250)}return false}
async function exp(p){const dl=p.waitForEvent('download',{timeout:600000}).catch(()=>null);await p.click('#generateBtn');const d=await dl;if(!d)return null;return crypto.createHash('sha256').update(fs.readFileSync(await d.path())).digest('hex').slice(0,16)}
for(const url of urls){
  const res={};
  for(const mode of ['plain','emboss','deboss']){
    const ctx=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true}),p=await ctx.newPage();
    await p.goto(url,{waitUntil:'load'});await p.waitForFunction(()=>typeof templateBase!=='undefined'&&!!templateBase,null,{timeout:120000});await settle(p);
    if(mode!=='plain'){await p.setInputFiles('#fileInput',IMAGE);await p.waitForFunction(()=>!!AppState.image,null,{timeout:30000});await settle(p);
      if(mode==='deboss'){await p.evaluate(()=>{document.getElementById('modeCarved').click();});await settle(p);} }
    res[mode]=await exp(p);await ctx.close();
  }
  console.log(url,JSON.stringify(res));
}
await browser.close();
