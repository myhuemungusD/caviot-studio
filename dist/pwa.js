'use strict';
// Offline support and safe updates. The worker (sw.js) registers on HTTPS sites only, so the local launcher
// (http://127.0.0.1) always serves the files on disk; ?sw=1 enables it locally for testing.
const CaviotPWA=(()=>{
  const state={registration:null,waiting:null,enabled:false};
  if(!('serviceWorker' in navigator))return state;
  const params=new URLSearchParams(location.search),local=/^(localhost|127\.|\[::1\]$)/.test(location.hostname);
  state.enabled=params.has('sw')||(location.protocol==='https:'&&!local);
  if(!state.enabled){
    // A worker left over from a ?sw=1 test must not keep serving cached files to the local launcher.
    navigator.serviceWorker.getRegistrations?.().then(list=>list.forEach(r=>r.unregister())).catch(()=>{});
    return state;
  }
  const hadController=!!navigator.serviceWorker.controller;let reloading=false;
  // When a new version takes over (here or in another tab), reload once so the page and files match again.
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!hadController||reloading)return;reloading=true;
    const go=()=>{if(typeof exportBusy!=='undefined'&&exportBusy){setTimeout(go,1000);return}location.reload()};go();
  });
  const banner=document.createElement('div');banner.className='update-banner';banner.setAttribute('role','status');banner.hidden=true;
  banner.innerHTML='<span>A new version of Caviot Studio is ready.</span><button type="button" class="btn btn-primary btn-sm" data-update="now">Reload</button><button type="button" class="btn btn-ghost btn-sm" data-update="later">Later</button>';
  document.body.appendChild(banner);
  banner.addEventListener('click',e=>{const act=e.target.closest('[data-update]')?.dataset.update;if(!act)return;
    if(act==='later'){banner.hidden=true;return}
    if(typeof exportBusy!=='undefined'&&exportBusy){toast('Finish the export first, then reload.','error');return}
    banner.hidden=true;state.waiting?.postMessage({type:'SKIP_WAITING'});});
  const offer=worker=>{state.waiting=worker;if(navigator.serviceWorker.controller)banner.hidden=false;};
  const track=reg=>{
    if(reg.waiting)offer(reg.waiting);
    reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed')offer(w)})});
  };
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{
      state.registration=reg;track(reg);
      const check=()=>reg.update().catch(()=>{});
      // Offline exports of smooth (non-sharp) designs need the 17 MB print surface. Fetch it once in the
      // background on fast unmetered-looking connections (the worker caches it); otherwise on first export.
      const c=navigator.connection;if(c&&!c.saveData&&c.effectiveType==='4g'&&c.type!=='cellular')setTimeout(()=>{if(navigator.serviceWorker.controller)fetch('templates/ETSYFOLGER-print.mesh').then(r=>r.arrayBuffer()).catch(()=>{})},15000);
      setInterval(check,30*60*1000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check()});
    }).catch(error=>console.warn('Offline support unavailable:',error.message));
  });
  return state;
})();
