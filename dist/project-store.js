'use strict';
// Phones: keep the design in progress on the device, so an iOS tab reload (memory pressure, switching apps, an
// update) brings it back instead of losing the customer's logo. One record in IndexedDB holds the same project data
// as Save project (format 4, PNG artwork) minus the custom STL template: per the studio's rule the template is never
// restored automatically; the record only remembers its name so the phone can offer to import it again.
// Desktop never runs this (no reads, no writes); the studio starts empty there exactly as before.
const CaviotAutosave=(()=>{
  const D=typeof CaviotDevice!=='undefined'?CaviotDevice:null;
  const DB_NAME='caviot.autosave.v1',STORE='designs',KEY='current',HEAVY_KEY='caviot.heavyOp';
  const LIMITS={
    maxBytes:30*1024*1024,       // serialized project; below ProjectFormat's 36 MB limit
    autoRestoreMs:12*3600*1000,  // newer designs come back by themselves (tab reloads, app switches)
    keepMs:14*24*3600*1000,      // older ones are offered on the start card, then deleted after two weeks
    debounceMs:1500,maxWaitMs:8000,heavyNoticeMs:15*60*1000,ioTimeoutMs:8000
  };
  const supported=typeof indexedDB!=='undefined';
  const enabled=!!D&&(D.phone||D.phoneLayout())&&supported;
  // The customer's artwork only: the default DM bottom logo alone is not a design worth keeping.
  const hasUserArtwork=()=>!!AppState.image||(typeof designLayers!=='undefined'&&designLayers.flat().some(s=>s.image));
  const emit=(type,detail={})=>{try{window.dispatchEvent(new CustomEvent('caviot:autosave',{detail:{type,...detail}}))}catch{}};

  // ---------- Pure helpers (unit tested in phone-tests.mjs) ----------
  function validRecord(r){return !!r&&typeof r==='object'&&r.v===1&&typeof r.json==='string'&&r.json.length>0&&r.json.length<=LIMITS.maxBytes&&Number.isFinite(r.savedAt)&&(r.custom===null||(!!r.custom&&typeof r.custom.name==='string'))}
  // 'restore' (recent), 'offer' (older: shown on the start card), 'expire' (delete) or 'none'.
  function decide(r,now=Date.now()){if(!r)return 'none';if(!validRecord(r))return 'expire';const age=now-r.savedAt;if(age<-60000||age>LIMITS.keepMs)return 'expire';return age<=LIMITS.autoRestoreMs?'restore':'offer'}
  function heavyNotice(raw,now=Date.now()){try{const h=JSON.parse(raw);if(!h||!['load','export'].includes(h.kind)||!Number.isFinite(h.at))return null;return now-h.at<=LIMITS.heavyNoticeMs&&now>=h.at-60000?h:null}catch{return null}}

  // ---------- IndexedDB (one short-lived connection per operation; every step has a timeout) ----------
  let dbPromise=null;
  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{let req;try{req=indexedDB.open(DB_NAME,1)}catch(e){reject(e);return}
      const timer=setTimeout(()=>reject(Error('Storage did not respond')),LIMITS.ioTimeoutMs);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};
      req.onsuccess=()=>{clearTimeout(timer);const db=req.result;db.onversionchange=()=>{db.close();dbPromise=null};db.onclose=()=>{dbPromise=null};resolve(db)};
      req.onerror=()=>{clearTimeout(timer);reject(req.error||Error('Storage unavailable'))};
      req.onblocked=()=>{clearTimeout(timer);reject(Error('Storage is blocked by another tab'))};
    }).catch(e=>{dbPromise=null;throw e});
    return dbPromise;
  }
  async function io(mode,fn){
    const db=await openDb();
    return new Promise((resolve,reject)=>{let tx,result;const timer=setTimeout(()=>{try{tx?.abort()}catch{}reject(Error('Storage timed out'))},LIMITS.ioTimeoutMs);
      try{tx=db.transaction(STORE,mode);const req=fn(tx.objectStore(STORE));if(req)req.onsuccess=()=>{result=req.result}}catch(e){clearTimeout(timer);reject(e);return}
      tx.oncomplete=()=>{clearTimeout(timer);resolve(result)};
      tx.onerror=()=>{clearTimeout(timer);reject(tx.error||Error('Storage failed'))};
      tx.onabort=()=>{clearTimeout(timer);reject(tx.error||Error('Storage write was cancelled'))};
    });
  }
  const readRecord=()=>io('readonly',s=>s.get(KEY));
  const writeRecord=r=>io('readwrite',s=>s.put(r,KEY));
  const deleteRecord=()=>io('readwrite',s=>s.delete(KEY));

  // ---------- Artwork encoding: each image is turned into PNG data once ----------
  const encoded=new WeakMap();
  function encodeImage(img){
    if(encoded.has(img))return encoded.get(img);
    let url;const src=typeof img.src==='string'?img.src:'';
    // Restored and resized artwork already is a PNG data URL; reuse it instead of encoding again.
    if(/^data:image\/png;base64,/.test(src))url=src;
    else{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');if(!ctx)throw Error('Not enough memory to keep the artwork');ctx.drawImage(img,0,0);url=c.toDataURL('image/png');c.width=c.height=0;}
    encoded.set(img,url);return url;
  }

  // ---------- Saving ----------
  let ready=false,restoring=false,stopped=false,ownsRecord=false,timer=null,firstPending=0,saving=null,lastSaved=-1,changes=0,warnedLarge=false,warnedFail=false;
  const changeCount=()=>(typeof projectRevision==='number'?projectRevision:0)+changes;
  function schedule(){
    if(!enabled||stopped)return;
    const now=Date.now();if(!timer)firstPending=now;clearTimeout(timer);
    timer=setTimeout(()=>{timer=null;save()},now-firstPending>=LIMITS.maxWaitMs?0:LIMITS.debounceMs);
  }
  async function save(){
    if(!enabled||stopped||!ready||restoring)return;
    if(saving){await saving.catch(()=>{});if(changeCount()!==lastSaved)schedule();return}
    // The export needs the memory; save right after it (exports flush first, see phone-ui.js).
    if(typeof exportBusy!=='undefined'&&exportBusy){clearTimeout(timer);timer=setTimeout(()=>{timer=null;save()},2000);return}
    clearTimeout(timer);timer=null;const revision=changeCount();if(revision===lastSaved)return;
    saving=(async()=>{
      if(!hasUserArtwork()){if(ownsRecord){await deleteRecord();ownsRecord=false;emit('cleared')}lastSaved=revision;return}
      const p=buildProjectData({encodeImage,withTemplate:false});
      const json=JSON.stringify(p);
      if(json.length>LIMITS.maxBytes){
        // An older copy would come back after a reload and look like lost changes, so remove it.
        if(ownsRecord){await deleteRecord().catch(()=>{});ownsRecord=false}lastSaved=revision;
        if(!warnedLarge){warnedLarge=true;emit('too-large',{bytes:json.length})}return;
      }
      const custom=AppState.templateId==='custom-stl'&&typeof customTemplate!=='undefined'&&customTemplate?{name:String(customTemplate.name).slice(0,120),triangles:customTemplate.report?.triangles||0}:null;
      await writeRecord({v:1,savedAt:Date.now(),name:p.name,layers:p.layers.flat().length,custom,json});
      ownsRecord=true;lastSaved=revision;warnedLarge=false;emit('saved',{bytes:json.length});
    })();
    try{await saving}
    catch(error){console.warn('Autosave failed:',error);if(!warnedFail){warnedFail=true;emit('failed',{message:error?.name==='QuotaExceededError'?'This phone is out of storage space for the autosave.':String(error?.message||error)})}}
    finally{saving=null}
    if(changeCount()!==lastSaved)schedule();
  }
  async function flush(){if(!enabled||stopped||!ready)return;clearTimeout(timer);timer=null;if(changeCount()!==lastSaved||saving)await save()}

  // ---------- Start-up: restore or offer ----------
  let offer=null;
  function waitForStudio(){return new Promise(resolve=>{const t0=Date.now();const check=()=>{const done=typeof builtinTemplateBase!=='undefined'&&(builtinTemplateBase||builtinTemplateError);if(done||Date.now()-t0>120000)resolve(!!done&&!!builtinTemplateBase);else setTimeout(check,100)};check()})}
  async function restoreRecord(record,{announce='restored'}={}){
    let p;try{p=ProjectFormat.decode(record.json)}catch(error){await deleteRecord().catch(()=>{});throw error}// damaged: forget it
    restoring=true;
    try{const notice=await openProjectData(p,{confirmReplace:false,announce:false});ownsRecord=true;lastSaved=changeCount();emit(announce,{custom:record.custom,savedAt:record.savedAt,notice:notice||''})}
    finally{restoring=false}
  }
  async function start(){
    const bootRevision=changeCount();
    const studioReady=await waitForStudio();
    let record=null;
    try{record=await readRecord()}catch(error){console.warn('Autosave unavailable:',error);emit('unavailable',{message:String(error?.message||error)});ready=true;return}
    const decision=decide(record);
    if(decision==='expire'){await deleteRecord().catch(()=>{})}
    // Something was already added or opened while the studio loaded: keep that, the next save replaces the record.
    else if(decision!=='none'&&(changeCount()!==bootRevision||hasUserArtwork()));
    else if(decision==='restore'&&studioReady){
      // A damaged record is deleted by restoreRecord; anything else (e.g. a tap while it loaded) keeps it on offer.
      try{await restoreRecord(record)}catch(error){console.warn('Autosave restore failed:',error);if(record&&validRecord(record)&&!/not a supported|invalid|must be|too large/i.test(String(error?.message))){offer={savedAt:record.savedAt,name:record.name,layers:record.layers,custom:record.custom};emit('offer',offer)}emit('restore-failed',{message:String(error?.message||error)})}
    }else if(decision==='offer'||decision==='restore'){offer={savedAt:record.savedAt,name:record.name,layers:record.layers,custom:record.custom};emit('offer',offer)}
    ready=true;emit('ready');
    schedule();// anything changed while it loaded (no-op otherwise)
  }
  async function resumeOffer(){
    if(!offer)return false;const record=await readRecord();offer=null;
    if(decide(record)==='none'||decide(record)==='expire'){emit('offer-gone');return false}
    await restoreRecord(record,{announce:'resumed'});return true;
  }
  async function discard(){clearTimeout(timer);timer=null;offer=null;ownsRecord=false;try{await deleteRecord()}catch(error){console.warn(error)}emit('cleared')}
  // "Start new design": stop saving, forget the record, reload to the clean ETSYFOLGER default.
  async function startNew(){stopped=true;clearTimeout(timer);timer=null;if(saving)await saving.catch(()=>{});try{await deleteRecord()}catch(error){console.warn(error)}try{clean()}catch{}location.reload()}

  // ---------- "The page reloaded during a heavy job" notice (never crash silently) ----------
  function markHeavy(kind,detail={}){if(!enabled&&!(D&&D.detected==='light'))return;try{localStorage.setItem(HEAVY_KEY,JSON.stringify({kind,at:Date.now(),...detail}))}catch{}}
  function clearHeavy(kind){try{const h=heavyNotice(localStorage.getItem(HEAVY_KEY)||'null',Infinity);if(!kind||!h||h.kind===kind)localStorage.removeItem(HEAVY_KEY)}catch{}}
  function takeHeavyNotice(){try{const raw=localStorage.getItem(HEAVY_KEY);if(!raw)return null;localStorage.removeItem(HEAVY_KEY);return heavyNotice(raw)}catch{return null}}

  if(enabled){
    // Anything that marks the project changed (edits, placement, undo/redo, images) or saves settings.
    if(typeof saveSettings==='function'){const prior=saveSettings;saveSettings=function(...args){const r=prior.apply(this,args);changes++;schedule();return r}}
    if(typeof dirty==='function'){const prior=dirty;dirty=function(...args){const r=prior.apply(this,args);schedule();return r}}
    // Undo/redo marks the project changed through the original dirty(); catch every revision with a light check.
    setInterval(()=>{if(ready&&!stopped&&!timer&&!saving&&changeCount()!==lastSaved)schedule()},2000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});
    window.addEventListener('pagehide',()=>{flush()});
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start());else start();
  }
  return {enabled,supported,LIMITS,hasUserArtwork,validRecord,decide,heavyNotice,flush,discard,startNew,resumeOffer,markHeavy,clearHeavy,takeHeavyNotice,
    get ready(){return ready},get offer(){return offer},get ownsRecord(){return ownsRecord},_save:save};
})();
