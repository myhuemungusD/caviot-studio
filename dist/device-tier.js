'use strict';
// Device detection for phones and low-memory devices. Loaded before the 3D preview so the renderer, the mesh
// budgets and the export defaults can all follow it. Desktop keeps 'full' (identical to before); phones and
// low-memory devices get 'light': lighter preview, smaller vertex budgets, and a phone-safe export spacing.
// Override for testing or by choice: ?tier=light|full, or the Export quality choice in the phone tools sheet.
const CaviotDevice=(()=>{
  const nav=globalThis.navigator||{},w=globalThis.window||{},mq=q=>{try{return !!w.matchMedia?.(q).matches}catch{return false}};
  const ua=nav.userAgent||'',touchPoints=nav.maxTouchPoints||0;
  const iOS=/iP(hone|od|ad)/.test(ua)||(nav.platform==='MacIntel'&&touchPoints>1);
  const android=/Android/i.test(ua);
  const uaMobile=!/iPad/.test(ua)&&(typeof nav.userAgentData?.mobile==='boolean'?nav.userAgentData.mobile:/Android.+Mobile|iPhone|iPod|Windows Phone|Mobile Safari/i.test(ua));
  const coarse=mq('(pointer: coarse)'),touch=touchPoints>0||coarse;
  const scr=w.screen||{},shortSide=Math.min(scr.width||w.innerWidth||1e4,scr.height||w.innerHeight||1e4);
  const memory=typeof nav.deviceMemory==='number'?nav.deviceMemory:null;// Chromium only; Safari/Firefox report nothing
  const phone=uaMobile||(touch&&shortSide<=500);
  const lowMemory=memory!==null&&(memory<=2||(touch&&memory<=4));
  const detected=phone||lowMemory?'light':'full';
  let urlTier=null,stored=null;
  try{urlTier=new URLSearchParams(w.location?.search||'').get('tier')}catch{}
  if(urlTier!=='light'&&urlTier!=='full')urlTier=null;
  try{stored=w.localStorage?.getItem('caviot.exportQuality')}catch{}
  // A phone keeps phone-safe limits unless the user picked Full quality in the tools sheet.
  const tier=urlTier||(detected==='light'&&stored==='full'?'full':detected);
  // Phone layout follows the viewport (rotation, split screen), not the device class.
  const PHONE_QUERY='(max-width: 760px), (max-height: 520px) and (pointer: coarse)';
  const LIMITS={
    full:{label:'Full quality',exportSpacing:.14,previewSpacing:.24,meshBudget:1400000,exportDetail:400,maxImagePixels:24e6,pixelRatio:2},
    light:{label:'Phone-safe quality',exportSpacing:.2,previewSpacing:.3,meshBudget:900000,exportDetail:250,maxImagePixels:12e6,pixelRatio:1.5}
  };
  const api={iOS,android,phone,touch,memory,detected,tier,urlOverride:!!urlTier,PHONE_QUERY,LIMITS,
    get limits(){return LIMITS[api.tier]},
    phoneLayout:()=>mq(PHONE_QUERY),
    standalone:()=>mq('(display-mode: standalone)')||nav.standalone===true};
  try{document.documentElement.classList.toggle('touch-device',touch);document.documentElement.dataset.tier=tier}catch{}
  return api;
})();
