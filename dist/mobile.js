'use strict';
// Phones and tablets: compact top bar with an overflow menu, the tools as a bottom sheet, touch-friendly
// gestures on the canvas, phone-safe mesh limits, a heavy-export warning, and an iOS-friendly file handoff.
// On desktop the elements added here stay hidden by CSS and none of the wrappers change behaviour.
(()=>{
const D=CaviotDevice,isPhone=()=>D.phoneLayout(),sidebar=document.querySelector('.sidebar');

// ---------- Overflow menu (Save / Open / Guide / OBJ / STL template / Reset view) ----------
const more=document.createElement('button');more.type='button';more.id='mobileMoreBtn';more.className='btn btn-ghost mobile-only';more.setAttribute('aria-label','More actions');more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded','false');more.innerHTML='<span aria-hidden="true">⋮</span>';
const menu=document.createElement('div');menu.id='mobileMenu';menu.className='mobile-menu';menu.setAttribute('role','menu');menu.hidden=true;
const items=[['startNewDesign','Start new design…'],['saveProject','Save project'],['openProject','Open project…'],['downloadObjBtn','Export OBJ'],['openSTL','Import STL template…'],['resetViewBtn','Reset view'],['guideBtn','Guide']];
for(const [id,label]of items){const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.dataset.target=id;b.textContent=label;b.onclick=()=>{closeMenu();const t=$(id);if(t&&!t.disabled)t.click();};menu.appendChild(b);}
document.querySelector('.project-actions').append(more);document.body.appendChild(menu);
function openMenu(){for(const b of menu.querySelectorAll('button')){const t=$(b.dataset.target);b.disabled=!t||t.disabled;}menu.hidden=false;more.setAttribute('aria-expanded','true');menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});}
function closeMenu(){if(menu.hidden)return;menu.hidden=true;more.setAttribute('aria-expanded','false');}
more.onclick=e=>{e.stopPropagation();menu.hidden?openMenu():closeMenu();};
document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&e.target!==more&&!more.contains(e.target))closeMenu();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){closeMenu();more.focus();}});
window.addEventListener('resize',closeMenu);

// ---------- Bottom sheet: grab handle (tap toggles size, swipe down closes) ----------
const handle=document.createElement('div');handle.className='sheet-handle mobile-only';handle.innerHTML='<button type="button" class="sheet-grip" aria-label="Resize tools sheet"><span></span></button><strong>Tools</strong><button type="button" class="btn btn-ghost btn-sm sheet-done">Done</button>';
sidebar.prepend(handle);
handle.querySelector('.sheet-done').onclick=()=>setSettingsOpen(false);
handle.querySelector('.sheet-grip').onclick=()=>document.body.classList.toggle('sheet-full');
let swipe=null;
handle.addEventListener('pointerdown',e=>{if(e.target.closest('.sheet-done'))return;swipe={y:e.clientY,t:performance.now(),id:e.pointerId};sidebar.style.transition='none';});
handle.addEventListener('pointermove',e=>{if(!swipe||e.pointerId!==swipe.id)return;const dy=e.clientY-swipe.y;if(Math.abs(dy)>4)handle.setPointerCapture?.(e.pointerId);if(dy>0)sidebar.style.transform='translateY('+dy+'px)';});
const endSwipe=e=>{if(!swipe||e.pointerId!==swipe.id)return;const dy=e.clientY-swipe.y,fast=dy/(performance.now()-swipe.t)>.6;swipe=null;sidebar.style.transition='';sidebar.style.transform='';
 if(dy>90||(fast&&dy>30)){if(document.body.classList.contains('sheet-full')&&dy<220&&!fast)document.body.classList.remove('sheet-full');else{document.body.classList.remove('sheet-full');setSettingsOpen(false);}}
 else if(dy<-40)document.body.classList.add('sheet-full');};
handle.addEventListener('pointerup',endSwipe);handle.addEventListener('pointercancel',endSwipe);
// Closing the sheet always returns to the half-height size next time.
const sheetObserver=new MutationObserver(()=>{const c=document.body.classList;if(!c.contains('mobile-settings-open')&&c.contains('sheet-full'))c.remove('sheet-full');});
sheetObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

// ---------- Canvas: no page zoom, scroll bounce, text selection or callouts while orbiting ----------
const container=$('threeContainer');
for(const type of ['gesturestart','gesturechange','gestureend'])container.addEventListener(type,e=>e.preventDefault(),{passive:false});
container.addEventListener('dblclick',e=>e.preventDefault());
container.addEventListener('touchmove',e=>{if(e.cancelable)e.preventDefault();},{passive:false});

// ---------- Phone-safe mesh limits ----------
function exportQuality(){try{return localStorage.getItem('caviot.exportQuality')==='full'?'full':'safe'}catch{return 'safe'}}
function applyTier(){if(D.urlOverride)return;D.tier=D.detected==='light'&&exportQuality()==='safe'?'light':D.detected==='light'?'full':D.tier;document.documentElement.dataset.tier=D.tier;}
if(D.detected==='light'){
 const panel=document.createElement('section');panel.className='panel export-quality-panel';
 panel.innerHTML='<div class="panel-label">Export quality on this device</div><label class="sr-only" for="exportQuality">Export quality</label><select id="exportQuality"><option value="safe">Phone-safe (recommended)</option><option value="full">Full quality (computer level)</option></select><p class="muted-tip" id="exportQualityHelp"></p>';
 document.querySelector('.output-mode-panel')?.after(panel)||sidebar.append(panel);
 const select=panel.querySelector('select'),help=panel.querySelector('#exportQualityHelp');
 const sync=()=>{select.value=exportQuality();applyTier();help.textContent=D.tier==='light'?'Outlines at '+D.limits.exportSpacing+' mm and at most '+(D.limits.meshBudget/1000)+'k vertices, so the export fits in a phone\u2019s memory. Plenty for FDM and resin prints.':'Same detail as on a computer (0.14 mm outlines). Large designs can run out of memory on phones and reload the page.';};
 select.onchange=()=>{try{localStorage.setItem('caviot.exportQuality',select.value)}catch{}sync();if(typeof requestTemplatePreview==='function'&&templateActive())requestTemplatePreview();};
 sync();
}
const lightOptions=o=>{if(D.tier!=='light')return o;const L=D.limits,sharpOnly=AppState.templateId!=='custom-stl'&&(o.designs?.length?o.designs.every(d=>d.sharp):!!o.sharp);
 // Sharp-edged designs on the built-in sleeve use the lighter preview surface as the export base (the same
 // sleeve shape; the outlines are refined to the export spacing either way), which roughly halves memory.
 return {...o,exportSpacing:L.exportSpacing,previewSpacing:L.previewSpacing,meshBudget:L.meshBudget,...(sharpOnly?{exportSurface:'preview'}:{})};};
if(typeof templateOptions==='function'){const tierOriginalOptions=templateOptions;templateOptions=function(...args){return lightOptions(tierOriginalOptions(...args));};}
const tierOriginalDetail=MC.getExportDetail;MC.getExportDetail=detail=>{const d=tierOriginalDetail(detail);return D.tier==='light'?Math.min(d,D.limits.exportDetail):d;};

// ---------- Heavy export warning (phones and low-memory devices only) ----------
const heavy=document.createElement('dialog');heavy.className='product-dialog mobile-dialog';heavy.id='heavyExportDialog';
heavy.innerHTML='<h2>Large export on a phone</h2><p id="heavyExportText"></p><div class="layer-actions"><button class="btn btn-primary" data-choice="go">Export anyway</button><button class="btn btn-ghost" data-choice="safe">Use phone-safe quality</button><button class="btn btn-ghost" data-choice="cancel">Cancel</button></div>';
document.body.appendChild(heavy);
// Rough size of the exported mesh, from the mobile audit: the built-in sleeve is about 450k triangles phone-safe and
// 1.3M at full quality; a custom STL keeps all of its triangles (+10 % refinement); each design adds up to about
// 2.5 triangles per contour cell of its box (measured: 483k at 30×20 mm, 684k at 80×40, 1.24M at 150×85, phone-safe). Export needs about 0.5 KB of memory per output triangle.
function exportEstimate(){const L=D.limits,s=L.exportSpacing||.2;let base;
 if(templateActive()&&AppState.templateId==='custom-stl'){const tris=typeof customTemplate!=='undefined'&&customTemplate?.report?.triangles||templateBase?.sourceTriangles||((templateBase?.indices?.length||0)/3);base=tris*1.1}
 else base=D.tier==='light'?450000:1300000;
 const designs=typeof designLayers!=='undefined'?designLayers.flat().filter(d=>d.image):[];
 const tris=Math.round(base+designs.reduce((t,d)=>t+2.5*d.designWidth*d.designHeight/(s*s),0));
 return {tris,fileMB:Math.round(tris*50/1048576),memoryMB:Math.round(tris*.5/1024)};}
globalThis.exportEstimate=exportEstimate;
function heavyReasons(format){if(D.detected!=='light')return [];const r=[],budget=D.device?.exportTriangleBudget??Infinity;
 if(D.tier!=='light')r.push('Full quality is on, which can need over 600 MB of memory for a large design.');
 if(templateActive()){const e=exportEstimate();if(e.tris>budget)r.push('This export is about '+(e.tris/1e6).toFixed(1)+' million triangles (a '+e.fileMB+' MB file) and needs roughly '+e.memoryMB+' MB of memory.');}
 if(templateActive()&&AppState.templateId==='custom-stl'&&repairOnExport)r.push('Make watertight is on for a custom template.');
 if(format==='obj'&&D.tier!=='light')r.push('OBJ files are text and need about three times the memory of STL.');
 return r;}
function askHeavy(reasons){return new Promise(resolve=>{heavy.querySelector('#heavyExportText').textContent=reasons.join(' ')+' The browser may run out of memory and reload this page'+(typeof CaviotAutosave!=='undefined'&&CaviotAutosave.enabled?' (your design is kept on this phone and comes back). Exporting on a computer is safer for large models.':'. Save your project first if you are unsure.');heavy.querySelector('[data-choice="safe"]').hidden=D.tier==='light';const done=v=>{heavy.close();resolve(v);};heavy.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>done(b.dataset.choice));heavy.oncancel=e=>{e.preventDefault();done('cancel');};heavy.showModal();});}
const tierOriginalExport=exportCurrent;
exportCurrent=async function(format){if(exportBusy)return;const reasons=heavyReasons(format);
 if(reasons.length){const choice=await askHeavy(reasons);if(choice==='cancel')return;if(choice==='safe'){try{localStorage.setItem('caviot.exportQuality','safe')}catch{}const s=$('exportQuality');if(s){s.value='safe';s.onchange();}else applyTier();}}
 if(isPhone()&&settingsAreOpen())setSettingsOpen(false);
 return tierOriginalExport(format);};

// ---------- iOS file handoff: share sheet / download / open, each from a fresh tap ----------
const ready=document.createElement('dialog');ready.className='product-dialog mobile-dialog';ready.id='fileReadyDialog';
ready.innerHTML='<h2>Your file is ready</h2><p id="fileReadyName"></p><div class="layer-actions file-ready-actions"><button class="btn btn-primary" data-act="share">Share…</button><button class="btn btn-ghost" data-act="download">Download</button><button class="btn btn-ghost" data-act="open">Open in new tab</button><button class="btn btn-ghost" data-act="close">Close</button></div><p class="muted-tip" id="fileReadyHelp"></p>';
document.body.appendChild(ready);
let readyFile=null,readyUrl=null;
const mimeFor=name=>/\.stl$/i.test(name)?'model/stl':/\.obj$/i.test(name)?'model/obj':/\.icaviot$/i.test(name)?'application/json':'application/octet-stream';
function canShareFile(file){try{return !!navigator.canShare&&(navigator.canShare({files:[file]})||navigator.canShare({files:[new File([file],file.name,{type:'application/octet-stream'})]}))}catch{return false}}
globalThis.canShareFile=canShareFile;
globalThis.showFileReady=function(blob,filename){
 if(readyUrl)URL.revokeObjectURL(readyUrl);readyUrl=null;
 readyFile={blob,filename};const mb=blob.size/1048576;ready.querySelector('#fileReadyName').textContent=filename+' · '+(mb>=1?mb.toFixed(1)+' MB':Math.max(1,Math.round(blob.size/1024))+' KB');
 const file=new File([blob],filename,{type:blob.type||mimeFor(filename)});
 const canShare=canShareFile(file),shareBtn=ready.querySelector('[data-act="share"]'),downloadBtn=ready.querySelector('[data-act="download"]');
 // Share comes first (AirDrop, Files, slicer apps); without it, Download is the main action.
 shareBtn.hidden=!canShare;downloadBtn.classList.toggle('btn-primary',!canShare);downloadBtn.classList.toggle('btn-ghost',canShare);
 ready.querySelector('[data-act="open"]').hidden=!D.iOS;
 ready.querySelector('#fileReadyHelp').textContent=D.iOS?'Share can send the file to Files, AirDrop or a slicer app. In Safari, Download saves to the Files app (Downloads).':'Share can send the file to another app. Download saves it to this device\u2019s Downloads.';
 if(!ready.open)ready.showModal();
};
ready.addEventListener('click',async e=>{const act=e.target.closest('[data-act]')?.dataset.act;if(!act||!readyFile)return;const {blob,filename}=readyFile;
 if(act==='close'){ready.close();return}
 if(act==='download'){saveBlobWithAnchor(blob,filename);return}
 if(act==='open'){readyUrl=readyUrl||URL.createObjectURL(blob);if(!window.open(readyUrl,'_blank'))location.assign(readyUrl);return}
 if(act==='share'){let file=new File([blob],filename,{type:blob.type||mimeFor(filename)});try{if(!navigator.canShare({files:[file]}))file=new File([blob],filename,{type:'application/octet-stream'});}catch{}
  try{await navigator.share({files:[file],title:filename});ready.close();}catch(error){if(error?.name!=='AbortError'){toast('Sharing is not available here. Use Download instead.','error');}}}
});
ready.addEventListener('close',()=>{readyFile=null;if(readyUrl){const u=readyUrl;readyUrl=null;setTimeout(()=>URL.revokeObjectURL(u),60000);}});

// ---------- Small phone niceties ----------
// A photo picked from the sheet: close the sheet so the design is visible on the sleeve right away.
let closeSheetForImage=false;$('fileInput')?.addEventListener('change',()=>{closeSheetForImage=isPhone();});
if(typeof setDesignImage==='function'){const mobileOriginalSetImage=setDesignImage;setDesignImage=function(img,label,...rest){const r=mobileOriginalSetImage.call(this,img,label,...rest);if(closeSheetForImage&&!String(label||'').startsWith('text:')){closeSheetForImage=false;if(isPhone()){setSettingsOpen(false);toast('Design added · drag it to move · Tools to adjust size and depth','success');}}return r;};}
// The mesh-repair card floats over the canvas on desktop; on a phone it lives in the tools sheet.
const repair=document.querySelector('.mesh-repair-panel'),repairHome=repair?.parentElement;
function placeRepair(){if(!repair)return;const target=isPhone()?sidebar:repairHome;if(repair.parentElement!==target)target.appendChild(repair);}
// Sleeve status (progress, placement hints, errors) lives in the sheet; on a phone mirror it over the canvas.
const status=document.createElement('div');status.className='phone-status';status.setAttribute('aria-hidden','true');$('threeContainer').parentElement.appendChild(status);
let statusTimer=null;const source=$('templateStatus');
// Only progress, results and problems show over the canvas; routine notes ("Designs follow the sleeve surface…",
// "ready", positioning hints) stay in the sheet so the jargon does not cover the sleeve.
const statusWorthy=(text,error)=>error||exportBusy||/loading|preparing|forming export|export|repair|could not|failed|cannot|too large|no relief|stopped/i.test(text);
if(source)new MutationObserver(()=>{if(!isPhone()||settingsAreOpen())return;const text=source.textContent.trim();if(!text)return;if(!statusWorthy(text,source.classList.contains('error')))return;status.textContent=text;status.classList.toggle('error',source.classList.contains('error')||source.dataset.error==='true');status.classList.add('show');clearTimeout(statusTimer);statusTimer=setTimeout(()=>status.classList.remove('show'),exportBusy?15000:3500);}).observe(source,{childList:true,characterData:true,subtree:true});
const phoneQuery=matchMedia(D.PHONE_QUERY);(phoneQuery.addEventListener?phoneQuery.addEventListener('change',placeRepair):phoneQuery.addListener(placeRepair));placeRepair();
if(D.detected==='light'&&document.readyState!=='loading')applyTier();
})();
