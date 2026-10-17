'use strict';
// Display names that differ between the website/desktop and the native phone apps (App Store / Play
// guideline on tobacco and vape products). Native mode is on when the phone build flag is set
// (mobile/scripts/sync-www.mjs injects window.CAVIOT_NEUTRAL_LABELS before this file) or when running
// inside Capacitor. Only labels change: template ids, presets' geometry and exports are identical.
const CaviotLabels=(()=>{
  const g=globalThis;let native=false;
  try{native=!!(g.CAVIOT_NEUTRAL_LABELS||(g.Capacitor&&typeof g.Capacitor.isNativePlatform==='function'&&g.Capacitor.isNativePlatform()))}catch{}
  const template=native?'Classic Sleeve':'Foger Sleeve',templateFile=native?'Classic-Sleeve':'Foger-Sleeve';
  const t=s=>native?String(s).replace(/Foger Sleeve/g,'Classic Sleeve').replace(/Foger-Sleeve/g,'Classic-Sleeve'):s;
  // Presets hidden in native mode (vape devices). Their ids stay valid for older saved projects.
  const hiddenPresets=['geek-bar-pulse','geek-bar-pulse-x','foger-switch-pro','foger-switch-pro-full'];
  function applyDom(doc){
    if(!native||!doc)return;
    const select=doc.getElementById('lighterChoice');
    if(select){for(const group of [...select.querySelectorAll('optgroup')])if(/vape/i.test(group.label))group.remove();
      for(const option of [...select.options])if(hiddenPresets.includes(option.value))option.remove();}
    const tip=doc.getElementById('devicePresetTip');
    if(tip&&/vape/i.test(tip.textContent))tip.innerHTML='Factory outer sizes used as sleeve cavity. Print a <strong>fit ring</strong> first — sizes vary by batch.';
    const walker=doc.createTreeWalker(doc.body,4);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes)if(/Foger/.test(node.nodeValue))node.nodeValue=t(node.nodeValue);
    for(const option of doc.querySelectorAll('option'))if(/Foger/.test(option.textContent))option.textContent=t(option.textContent);
  }
  return{native,template,templateFile,t,hiddenPresets,applyDom};
})();
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>CaviotLabels.applyDom(document));else CaviotLabels.applyDom(document);}
if(typeof module!=='undefined')module.exports=CaviotLabels;
