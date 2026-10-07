'use strict';
// Phone layout, phase 1 (October 7, 2026): a clear first step, a reordered and shorter tools sheet that keeps the
// logo in view, a working background picker, one Front/Back control, proportional sizing with pinch and twist on
// the selected design, phone memory guards for custom STLs, autosave/restore prompts and a phone-friendly export.
// Everything here is gated on the phone layout (CaviotDevice.phoneLayout()) or on a phone-class device; the
// desktop and tablet layouts, their DOM order and their exports are unchanged.
(()=>{
const D=CaviotDevice,isPhone=()=>D.phoneLayout(),phoneDevice=()=>D.phone||D.detected==='light';
const store=typeof CaviotAutosave!=='undefined'?CaviotAutosave:null,sidebar=document.querySelector('.sidebar'),canvasArea=document.querySelector('.canvas');
const el=(tag,props={},html='')=>{const n=document.createElement(tag);Object.assign(n,props);if(html)n.innerHTML=html;return n};
const sheetOpen=()=>settingsAreOpen();
// The customer's artwork (the default DM bottom logo alone does not count as a design).
const artwork=()=>!!AppState.image||(typeof designLayers!=='undefined'&&designLayers.flat().some(s=>s.image));
const fmtTime=t=>{try{return new Date(t).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}catch{return ''}};

// ======================= Image inputs: photos, camera, files =======================
// Photos uses the studio's own picker (#fileInput, image/*). Camera asks for the rear camera; Files lists image
// types so Android opens its file browser (iOS shows its usual Photo Library / Take Photo / Choose File sheet).
const cameraInput=el('input',{type:'file',id:'phoneCameraInput',accept:'image/*',hidden:true});cameraInput.setAttribute('capture','environment');
const filesInput=el('input',{type:'file',id:'phoneFilesInput',accept:'.png,.jpg,.jpeg,.webp,.gif,.heic,.heif,.avif,.bmp,image/png,image/jpeg,image/webp,image/heic',hidden:true});
for(const input of [cameraInput,filesInput]){input.addEventListener('change',()=>{const f=input.files?.[0];input.value='';if(f){closeForImage=true;loadImageFile(f)}});sidebar.appendChild(input)}
let closeForImage=false;
$('fileInput').addEventListener('change',()=>{closeForImage=isPhone()});
const addActions={
  photos:()=>{els.fileInput.click()},
  camera:()=>{cameraInput.click()},
  files:()=>{filesInput.click()},
  text:()=>{setSettingsOpen(true);showSection('phoneSecAdd');els.textInput.focus({preventScroll:true})}
};
const addButtonsHTML='<button type="button" class="btn btn-ghost phone-add-btn" data-add="photos"><span aria-hidden="true">▣</span>Photos</button><button type="button" class="btn btn-ghost phone-add-btn" data-add="camera"><span aria-hidden="true">◉</span>Camera</button><button type="button" class="btn btn-ghost phone-add-btn" data-add="files"><span aria-hidden="true">▤</span>Files</button><button type="button" class="btn btn-ghost phone-add-btn" data-add="text"><span aria-hidden="true">T</span>Text</button>';
function wireAddButtons(root){root.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>addActions[b.dataset.add]()))}
// After a logo arrives from a phone picker: close the sheet so it is visible on the sleeve, say how to place it.
if(typeof setDesignImage==='function'){const prior=setDesignImage;setDesignImage=function(img,label,...rest){const r=prior.call(this,img,label,...rest);if(closeForImage&&isPhone()&&!String(label||'').startsWith('text:')){closeForImage=false;if(sheetOpen())setSettingsOpen(false);toast('Logo added · drag to move · pinch to resize, twist to rotate','success')}syncAll();return r}}

// ======================= Tools sheet: phone sections in the order they are used =======================
const sections={
  phoneSecAdd:{label:'Add',icon:'＋',title:'Add a logo'},
  phoneSecClean:{label:'Background',icon:'◩',title:'Remove background'},
  phoneSecSize:{label:'Size',icon:'↔',title:'Size & rotation'},
  phoneSecFinish:{label:'Emboss',icon:'◐',title:'Emboss or deboss'},
  phoneSecSides:{label:'Front/back',icon:'⇆',title:'Front and back'},
  phoneAllSettings:{label:'All',icon:'☰',title:'All settings'}
};
const secEls={};
for(const [id,s]of Object.entries(sections)){
  if(id==='phoneAllSettings'){const d=el('details',{id,className:'panel phone-section phone-all'});d.innerHTML='<summary><span>All settings</span><small>Template, image options, bottom logo, export quality, repair</small></summary><div id="phoneAllBody"></div>';secEls[id]=d;continue}
  const sec=el('section',{id,className:'panel phone-section'});sec.setAttribute('aria-labelledby',id+'Title');sec.innerHTML='<h3 class="phone-section-title" id="'+id+'Title">'+s.title+'</h3>';secEls[id]=sec;
}
secEls.phoneSecAdd.insertAdjacentHTML('beforeend','<div class="phone-add-grid">'+addButtonsHTML+'</div>');wireAddButtons(secEls.phoneSecAdd);
secEls.phoneSecClean.insertAdjacentHTML('beforeend','<p class="phone-hint" id="phonePickHint">Preview of what gets printed. To pick the background colour, tap Pick, then tap the background in this picture.</p>');
const lockBtn=el('button',{type:'button',id:'lockAspect',className:'btn btn-ghost btn-sm phone-only lock-aspect'});
let aspectLocked=true;try{aspectLocked=localStorage.getItem('caviot.lockAspect')!=='off'}catch{}
function syncLock(){lockBtn.setAttribute('aria-pressed',String(aspectLocked));lockBtn.textContent=aspectLocked?'🔒 Proportions locked':'🔓 Width and height separate';lockBtn.title=aspectLocked?'Tap to change width and height separately':'Tap to keep the logo\u2019s proportions'}
lockBtn.onclick=()=>{aspectLocked=!aspectLocked;try{localStorage.setItem('caviot.lockAspect',aspectLocked?'on':'off')}catch{}rememberRatio(true);syncLock()};syncLock();
$('designSizing').insertBefore(lockBtn,$('placementFields'));

// Phone rail: labelled shortcuts to the sections (the desktop icon rail stays as it is on desktop).
const rail=el('nav',{className:'phone-rail',id:'phoneRail'});rail.setAttribute('aria-label','Tool sections');
for(const [id,s]of Object.entries(sections)){const b=el('button',{type:'button',className:'phone-rail-btn'});b.dataset.target=id;b.innerHTML='<span aria-hidden="true">'+s.icon+'</span>'+s.label;b.setAttribute('aria-label',s.title);b.onclick=()=>showSection(id);rail.appendChild(b)}
function showSection(id){setSettingsOpen(true);const target=secEls[id];if(id==='phoneAllSettings')target.open=true;requestAnimationFrame(()=>{const top=target.offsetTop-(sidebar.querySelector('.sheet-handle')?.offsetHeight||0)-rail.offsetHeight-6;sidebar.scrollTo({top:Math.max(0,top),behavior:'smooth'})})}

// Moving existing controls (with their listeners) into the phone sections, and back when the layout changes.
// A placeholder comment keeps each control's desktop position, so desktop DOM order is restored exactly.
let mounted=false;const moves=[];
function move(node,target,before=null){if(!node)return;const mark=document.createComment('phone-ui');node.parentNode.insertBefore(mark,node);moves.push([node,mark]);target.insertBefore(node,before)}
const labelRenames=[];
function mountPhone(){
  if(mounted)return;mounted=true;
  const handle=sidebar.querySelector('.sheet-handle');handle.after(rail);rail.after(...Object.values(secEls));
  const add=secEls.phoneSecAdd,clean=secEls.phoneSecClean,size=secEls.phoneSecSize,finish=secEls.phoneSecFinish,sides=secEls.phoneSecSides,all=$('phoneAllBody');
  move(els.textInput,add);move(els.textStretchField,add);
  move(els.bgEnable.closest('label'),clean,$('phonePickHint'));move(els.bgControls,clean,$('phonePickHint'));move(document.querySelector('.hm-mini'),clean,$('phonePickHint'));
  move($('designSizing'),size);
  move(els.modeRaised.closest('.pill-toggle'),finish);move(els.depthIn.closest('.big-field'),finish);
  const layerList=$('designLayerList'),layerActs=layerList?.nextElementSibling?.classList.contains('layer-actions')?layerList.nextElementSibling:null;
  move(document.querySelector('.design-side-buttons'),sides);move(layerList,sides);move(layerActs,sides);move($('copyDesignSide'),sides);
  // Everything else, in a useful order, inside All settings.
  const order=[document.querySelector('.template-select-panel'),$('designSidesPanel')?.closest('section'),$('imageScale')?.closest('section'),$('templatePlacement'),$('crisp')?.closest('section'),$('bottomBrandPanel'),document.querySelector('.export-quality-panel'),document.querySelector('.output-mode-panel'),$('sleevePanel'),$('flatPanel'),$('bendSection')];
  for(const node of order)if(node&&node.parentNode===sidebar)move(node,all);
  const repair=document.querySelector('.mesh-repair-panel');if(repair)all.appendChild(repair);// mobile.js moves it back on desktop
  // Section numbers from the desktop panel ("01 /", "03 /", "03 /") contradict the phone order: drop them.
  for(const label of sidebar.querySelectorAll('.panel-label')){const m=/^\s*\d+\s*\/\s*/.exec(label.textContent);if(m){labelRenames.push([label,label.textContent]);label.textContent=label.textContent.slice(m[0].length)}}
  document.body.classList.add('phone-ui');syncAll();
}
function unmountPhone(){
  if(!mounted)return;mounted=false;
  for(let i=moves.length-1;i>=0;i--){const [node,mark]=moves[i];mark.parentNode?.insertBefore(node,mark);mark.remove()}moves.length=0;
  for(const [label,text]of labelRenames)label.textContent=text;labelRenames.length=0;
  rail.remove();for(const s of Object.values(secEls))s.remove();
  document.body.classList.remove('phone-ui');setPicking(false);clearViewOffset();syncAll();
}
// Phone-irrelevant controls: the font-folder picker needs webkitdirectory (not on iOS Safari); "Trim flat plate"
// only matters for flat plates. Both are hidden by phone-ui.css while the class below says so.
function syncIrrelevant(){$('silhouette')?.closest('label')?.classList.toggle('phone-flat-only',AppState.mode!=='flat')}

// ======================= Empty sleeve: "Add the customer's logo" =======================
const start=el('div',{className:'phone-start',id:'phoneStart'});start.setAttribute('role','region');start.setAttribute('aria-labelledby','phoneStartTitle');
start.innerHTML='<h2 id="phoneStartTitle">Add the customer\u2019s logo</h2><p>A photo, a screenshot or an image file. Or type text.</p><div class="phone-add-grid">'+addButtonsHTML+'</div><div class="phone-start-extra" id="phoneStartExtra" hidden></div>';
wireAddButtons(start);canvasArea.appendChild(start);
const startExtra=start.querySelector('#phoneStartExtra');
function syncStart(){
  const show=isPhone()&&templateActive()&&!artwork()&&!sheetOpen()&&!(typeof exportBusy!=='undefined'&&exportBusy)&&!!templateBase&&(!store?.enabled||store.ready);
  start.hidden=!show;
  const offer=store?.offer;startExtra.hidden=!offer;
  if(offer&&startExtra.dataset.for!==String(offer.savedAt)){startExtra.dataset.for=String(offer.savedAt);startExtra.innerHTML='';
    const resume=el('button',{type:'button',className:'btn btn-ghost',id:'phoneResume'});resume.textContent='Resume last design · '+fmtTime(offer.savedAt);
    resume.onclick=async()=>{resume.disabled=true;try{await store.resumeOffer()}catch(error){toast('Could not resume: '+error.message,'error')}finally{resume.disabled=false;syncAll()}};
    const discard=el('button',{type:'button',className:'btn btn-ghost',id:'phoneDiscard'});discard.textContent='Discard';discard.onclick=async()=>{await store.discard();syncAll()};
    startExtra.append(resume,discard)}
  // Export with nothing on the sleeve is still possible (a blank sleeve), but it no longer looks like the next step.
  els.generateBtn.classList.toggle('phone-export-empty',isPhone()&&templateActive()&&!artwork());
}

// ======================= Autosave: restored banner, start new, problems =======================
const banner=el('div',{className:'phone-banner',id:'phoneBanner',hidden:true});banner.setAttribute('role','status');canvasArea.appendChild(banner);
let bannerTimer=null;
function showBanner(text,actions=[],sticky=false){banner.innerHTML='';const p=el('p');p.textContent=text;banner.appendChild(p);const row=el('div',{className:'phone-banner-actions'});
  for(const [label,fn,primary]of actions){const b=el('button',{type:'button',className:'btn btn-sm '+(primary?'btn-primary':'btn-ghost')});b.textContent=label;b.onclick=()=>{fn();};row.appendChild(b)}
  const close=el('button',{type:'button',className:'btn btn-ghost btn-sm phone-banner-close'});close.setAttribute('aria-label','Dismiss');close.textContent='×';close.onclick=hideBanner;row.appendChild(close);banner.appendChild(row);
  banner.hidden=false;clearTimeout(bannerTimer);if(!sticky)bannerTimer=setTimeout(hideBanner,12000)}
function hideBanner(){clearTimeout(bannerTimer);banner.hidden=true}
const startNewButton=el('button',{type:'button',id:'startNewDesign',hidden:true});startNewButton.onclick=()=>confirmStartNew();document.body.appendChild(startNewButton);
if(!store?.enabled)startNewButton.disabled=true;
function confirmStartNew(){if(artwork()&&!confirm('Start a new design? The current design is cleared from this phone. Save project first if you want to keep it.'))return;store.startNew()}
function reimportAction(custom){return ['Import '+(custom.name.length>18?custom.name.slice(0,17)+'…':custom.name)+'.stl',()=>{hideBanner();openTemplateUpload()},true]}
window.addEventListener('caviot:autosave',({detail})=>{
  const t=detail.type;
  if(t==='restored'||t==='resumed'){
    const custom=detail.custom;
    if(custom)showBanner('Restored your last design. It was on the custom template \u201c'+custom.name+'\u201d, which is not kept on the phone; it is shown on ETSYFOLGER until you import that STL again.',[reimportAction(custom),['Start new',confirmStartNew]],true);
    else showBanner(t==='restored'?'Restored your last design.':'Your last design is back.',[['Start new',confirmStartNew]]);
  }
  if(t==='too-large')toast('This design is too large to keep on the phone automatically. Use Save project to keep it.','error');
  if(t==='failed')toast('Autosave is not working: '+detail.message+' Use Save project to keep your design.','error');
  if(t==='restore-failed')toast('Could not restore your last design: '+detail.message,'error');
  syncAll();
});

// ======================= Background colour picking on the 2D preview =======================
// The pick handler in app.js listens on the heightmap preview, which is hidden on phones; the phone sheet shows the
// preview under Remove background. Pick toggles, and leaving the sheet, Escape or a pick ends it.
const pickBtn=$('bgPick');let exportMarked=false;
function setPicking(on){AppState.pickingBg=!!on&&!!AppState.image;pickBtn.setAttribute('aria-pressed',String(AppState.pickingBg));document.body.classList.toggle('phone-picking',AppState.pickingBg&&isPhone());}
// Listening on the document (capture) runs before app.js's own Pick handler on the button in every browser.
document.addEventListener('click',e=>{if(!isPhone()||!e.target.closest?.('#bgPick'))return;e.stopPropagation();
  if(!AppState.image){toast('Add a logo first','error');return}
  if(AppState.pickingBg){setPicking(false);toast('Pick cancelled');return}
  setPicking(true);toast('Tap the background in the preview picture');document.querySelector('.hm-mini')?.scrollIntoView({block:'nearest',behavior:'smooth'})},true);
// app.js clears pickingBg after a successful pick; keep the button and highlight in step.
els.heightmapCanvas.addEventListener('click',()=>setTimeout(()=>setPicking(AppState.pickingBg),0));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&AppState.pickingBg&&isPhone())setPicking(false)});

// ======================= One Front/Back control =======================
// On phones the canvas Front/Back buttons choose the side being edited and turn the camera with it (the sheet's
// side buttons already do both). Left/Right are hidden on phones.
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-template-view]');
  if(!b||!isPhone()||!['front','back'].includes(b.dataset.templateView))return;e.stopPropagation();
  if(typeof exportBusy!=='undefined'&&exportBusy)return;switchDesignSide(b.dataset.templateView==='back'?1:0)},true);
function syncToolbar(){
  const front=document.querySelector('[data-template-view="front"]'),back=document.querySelector('[data-template-view="back"]');if(!front||!back)return;
  if(!isPhone()){for(const b of [front,back]){b.removeAttribute('aria-pressed');b.textContent=b===front?'Front':'Back'}return}
  for(const [i,b]of [[0,front],[1,back]]){const n=typeof designLayers!=='undefined'?designLayers[i].filter(s=>s.image).length:0;b.textContent=(i?'Back':'Front')+(n?' · '+n:'');b.setAttribute('aria-pressed',String(activeDesignSide===i));b.disabled=typeof exportBusy!=='undefined'&&exportBusy}
}

// ======================= Proportional size =======================
const ratioBySlot=new WeakMap();
function currentSlot(){return typeof designSides!=='undefined'?designSides[activeDesignSide]:null}
function rememberRatio(force=false){const slot=currentSlot();if(!slot||!AppState.designWidth)return;const known=ratioBySlot.get(slot);if(force||!known||known.image!==AppState.image)ratioBySlot.set(slot,{image:AppState.image,ratio:AppState.designHeight/AppState.designWidth})}
function lockedRatio(){rememberRatio();return ratioBySlot.get(currentSlot())?.ratio||AppState.designHeight/AppState.designWidth}
function fitSize(width,height){const maxW=placementLimit('designWidth',2,160),maxH=placementLimit('designHeight',2,89);let k=1;if(width>maxW)k=Math.min(k,maxW/width);if(height>maxH)k=Math.min(k,maxH/height);if(width*k<2)k=2/width;if(height*k<2)k=Math.max(k,2/height);return [Math.round(width*k*100)/100,Math.round(height*k*100)/100]}
for(const id of ['designWidth','designHeight'])for(const suffix of ['Range','Number'])$(id+suffix).addEventListener('input',e=>{
  if(!isPhone()||!aspectLocked||!templateActive())return;const n=Number(e.target.value);if(e.target.value===''||!Number.isFinite(n))return;
  const r=lockedRatio(),[w,h]=id==='designWidth'?fitSize(AppState.designWidth,AppState.designWidth*r):fitSize(AppState.designHeight/r,AppState.designHeight);
  AppState.designWidth=w;AppState.designHeight=h;
  const otherId=id==='designWidth'?'designHeight':'designWidth';$(otherId+'Range').value=String(AppState[otherId]);$(otherId+'Number').value=String(AppState[otherId]);
  // The control being typed into keeps the user's text; its partner (and a clamped slider) shows the stored value.
  $(id+(suffix==='Range'?'Number':'Range')).value=String(AppState[id]);if(suffix==='Range')e.target.value=String(AppState[id]);
  updatePlacement()});
// Unlocked edits change the shape; locking again keeps the new shape.
for(const id of ['designWidth','designHeight'])for(const suffix of ['Range','Number'])$(id+suffix).addEventListener('change',()=>{if(isPhone()&&!aspectLocked)rememberRatio(true)});

// ======================= Pinch to resize, twist to rotate the selected design =======================
// Two fingers on or next to the selected design act on it (aspect ratio kept; rotation snaps to 0/90/180/270);
// anywhere else they still zoom and pan the camera. Listens on the canvas container in the capture phase, so it
// sees each touch before the design grab (template-ui.js) and OrbitControls on the canvas.
const container=$('threeContainer'),touches=new Map(),swallow=new Set();let pinch=null,orbitPaused=false;
const chip=el('div',{className:'phone-gesture-chip',hidden:true});chip.setAttribute('aria-live','polite');canvasArea.appendChild(chip);
const RING=[[0,0],[22,0],[-22,0],[0,22],[0,-22]];
function nearSelected(x,y){for(const [dx,dy]of RING)if(touchHitsSelectedDesign({clientX:x+dx,clientY:y+dy}))return true;return false}
function pinchAllowed(){return isPhone()&&templateActive()&&!(typeof exportBusy!=='undefined'&&exportBusy)&&!!AppState.image&&!!camera&&typeof touchHitsSelectedDesign==='function'&&!templateMoveFromButton()}
// The "Move design on sleeve" toggle makes every one-finger drag place the design; leave its gestures alone.
function templateMoveFromButton(){return $('moveDesign').getAttribute('aria-pressed')==='true'&&!(templateActivePointer!==null&&templateGrabTouch)}
const geometry=(a,b)=>({d:Math.hypot(b.x-a.x,b.y-a.y),a:Math.atan2(b.y-a.y,b.x-a.x)});
function stop(e){e.preventDefault();e.stopPropagation()}
container.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch')return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch){stop(e);swallow.add(e.pointerId);return}
  if(touches.size!==2||!pinchAllowed())return;
  const [a,b]=[...touches.values()],grabbing=templateActivePointer!==null&&templateGrabTouch;
  if(!(grabbing||nearSelected(a.x,a.y)||nearSelected(b.x,b.y)||nearSelected((a.x+b.x)/2,(a.y+b.y)/2)))return;
  stop(e);releaseLogoTouchGrab();if(controls.enabled){controls.enabled=false;orbitPaused=true}
  const g=geometry(a,b);pinch={ids:[...touches.keys()],d0:Math.max(12,g.d),a0:g.a,w0:AppState.designWidth,h0:AppState.designHeight,r0:AppState.designRotation,frame:null,changed:false};
  hidePhoneStatus();showChip();
},true);
container.addEventListener('pointermove',e=>{
  if(e.pointerType!=='touch'||!touches.has(e.pointerId))return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&pinch.ids.includes(e.pointerId)){stop(e);if(pinch.frame===null)pinch.frame=requestAnimationFrame(applyPinch);return}
  if(swallow.has(e.pointerId)||pinch)stop(e);
},true);
function liftTouch(e){
  if(e.pointerType!=='touch'||!touches.has(e.pointerId))return;touches.delete(e.pointerId);
  if(pinch&&pinch.ids.includes(e.pointerId)){stop(e);for(const id of pinch.ids)if(id!==e.pointerId&&touches.has(id))swallow.add(id);endPinch()}
  else if(swallow.has(e.pointerId)){stop(e);swallow.delete(e.pointerId)}
  if(!touches.size&&!pinch)resumeOrbit();
}
// Gives the camera back only if the pinch took it (the Move toggle and exports manage it themselves).
function resumeOrbit(){if(orbitPaused&&controls){orbitPaused=false;if(!templateMove)controls.enabled=true}}
container.addEventListener('pointerup',liftTouch,true);container.addEventListener('pointercancel',liftTouch,true);
// Touch events reach OrbitControls separately; while a pinch (or its leftover finger) is active they stop here.
for(const type of ['touchstart','touchmove','touchend'])container.addEventListener(type,e=>{if(pinch||swallow.size){if(e.cancelable)e.preventDefault();e.stopPropagation()}},{capture:true,passive:false});
function applyPinch(){
  if(!pinch)return;pinch.frame=null;const [a,b]=pinch.ids.map(id=>touches.get(id));if(!a||!b)return;
  const g=geometry(a,b),l=Math.log(g.d/pinch.d0),scale=Math.exp(Math.sign(l)*Math.max(0,Math.abs(l)-.04));// small dead zone: a pure twist does not resize
  let turn=-(g.a-pinch.a0)*180/Math.PI;turn-=360*Math.round(turn/360);turn=Math.sign(turn)*Math.max(0,Math.abs(turn)-8);// and a pure pinch does not rotate
  const [w,h]=fitSize(pinch.w0*scale,pinch.h0*scale);
  let r=pinch.r0+turn;const snap=Math.round(r/90)*90;if(Math.abs(r-snap)<6)r=snap;r=placementValue('designRotation',r,-180,180);
  if(w===AppState.designWidth&&h===AppState.designHeight&&r===AppState.designRotation)return;
  AppState.designWidth=w;AppState.designHeight=h;AppState.designRotation=r;for(const id of ['designWidth','designHeight','designRotation'])showPlacementValue(id);
  pinch.changed=true;showChip();updatePlacement();
}
function showChip(){chip.textContent=AppState.designWidth.toFixed(1)+' × '+AppState.designHeight.toFixed(1)+' mm'+(AppState.designRotation?' · '+AppState.designRotation+'°':'');chip.hidden=false}
function endPinch(){const p=pinch;if(p.frame!==null)cancelAnimationFrame(p.frame);applyPinch();pinch=null;setTimeout(()=>{if(!pinch)chip.hidden=true},900);if(p.changed){rememberRatio(true);finishPlacement();dirty()}}
function hidePhoneStatus(){document.querySelector('.phone-status')?.classList.remove('show')}
window.addEventListener('blur',()=>{touches.clear();swallow.clear();if(pinch)endPinch();resumeOrbit()});

// ======================= Keep the logo visible above the tools sheet =======================
// While the sheet covers the lower part of the canvas, shift (and slightly shrink) the 3D view into the visible
// part with camera.setViewOffset; raycasts use the same projection, so taps still land where they look.
let viewAnim=null,viewNow={s:1,x:0,y:0},viewTarget={s:1,x:0,y:0};
function sheetCover(){
  if(!isPhone()||!sheetOpen()||!renderer)return null;const c=renderer.domElement.getBoundingClientRect(),w=c.width,h=c.height;if(w<2||h<2)return null;
  const landscape=matchMedia('(orientation: landscape)').matches&&innerHeight<=520;
  if(landscape){const left=sidebar.offsetLeft,cover=Math.max(0,c.right-left);return cover>8?{w,h,x:cover,y:0}:null}
  const top=sidebar.offsetTop,cover=Math.max(0,Math.min(h*.8,c.bottom-top));return cover>8?{w,h,x:0,y:cover}:null;
}
function applyView(v){if(!camera||!renderer)return;const c=renderer.domElement.getBoundingClientRect(),w=c.width,h=c.height;
  if(v.s>.999&&Math.abs(v.x)<.5&&Math.abs(v.y)<.5){if(camera.view?.enabled){camera.clearViewOffset()}return}
  const fw=w*v.s,fh=h*v.s;camera.setViewOffset(fw,fh,fw/2-(w-v.x)/2,fh/2-(h-v.y)/2,w,h)}
function frameForSheet(){
  const cover=sheetCover();let next={s:1,x:0,y:0};
  if(cover){const visible=cover.y?(cover.h-cover.y)/cover.h:(cover.w-cover.x)/cover.w;next={s:Math.max(.42,Math.min(1,visible*1.1)),x:cover.x,y:cover.y}}
  if(Math.abs(next.s-viewTarget.s)<.005&&Math.abs(next.x-viewTarget.x)<1&&Math.abs(next.y-viewTarget.y)<1)return;viewTarget=next;
  cancelAnimationFrame(viewAnim);const from={...viewNow},t0=performance.now();
  const step=now=>{const k=Math.min(1,(now-t0)/220),e=1-Math.pow(1-k,3);viewNow={s:from.s+(viewTarget.s-from.s)*e,x:from.x+(viewTarget.x-from.x)*e,y:from.y+(viewTarget.y-from.y)*e};applyView(viewNow);if(k<1)viewAnim=requestAnimationFrame(step)};viewAnim=requestAnimationFrame(step);
}
function clearViewOffset(){cancelAnimationFrame(viewAnim);viewNow=viewTarget={s:1,x:0,y:0};if(camera?.view?.enabled)camera.clearViewOffset()}
// The sheet opens and closes through several paths (Tools, Done, drag, Escape); follow the body class.
let sheetWasOpen=null;new MutationObserver(()=>{setTimeout(frameForSheet,30);const open=sheetOpen();if(open!==sheetWasOpen){sheetWasOpen=open;if(!open)setPicking(false);syncStart()}}).observe(document.body,{attributes:true,attributeFilter:['class']});
sidebar.addEventListener('transitionend',e=>{if(e.target===sidebar)frameForSheet()});
window.addEventListener('resize',()=>{if(isPhone()&&sheetOpen())frameForSheet();else if(camera?.view?.enabled)clearViewOffset()});

// ======================= Custom STL memory guards (phones) =======================
const guardOn=()=>Number.isFinite(D.device?.customWarnTriangles);// phones and low-memory devices (or ?tier=light)
const stlTriangles=D.stlTriangles;
const stlDialog=el('dialog',{className:'product-dialog mobile-dialog',id:'phoneStlDialog'});stlDialog.setAttribute('aria-labelledby','phoneStlTitle');
stlDialog.innerHTML='<h2 id="phoneStlTitle"></h2><p id="phoneStlText"></p><div class="layer-actions"><button class="btn btn-ghost" data-choice="go">Load anyway</button><button class="btn btn-primary" data-choice="cancel">Cancel</button></div>';document.body.appendChild(stlDialog);
function askStl(info,name){
  const L=D.device,k=Math.round(info.count/1000),about=(info.estimated?'about ':'')+(info.count>=1e6?(info.count/1e6).toFixed(1)+' million':k+'k')+' triangles';
  if(info.count<=L.customWarnTriangles)return Promise.resolve(true);
  const block=info.count>L.customMaxTriangles,loadMB=Math.round(info.count*.3/1024),exportMB=Math.round(info.count*1.1*.5/1024);
  stlDialog.querySelector('#phoneStlTitle').textContent=block?'Too large for a phone':'Large model for a phone';
  stlDialog.querySelector('#phoneStlText').textContent=block?'\u201c'+name+'\u201d has '+about+'. Phones run out of memory above about '+(L.customMaxTriangles/1e6).toFixed(1)+' million triangles, so it cannot be loaded here. Use it on a computer, or simplify it in your mesh tool first.':'\u201c'+name+'\u201d has '+about+'. Loading needs about '+loadMB+' MB and exporting about '+exportMB+' MB of memory; if the phone runs out, the page reloads (your design is kept). A computer is safer for this model.';
  stlDialog.querySelector('[data-choice="go"]').hidden=block;stlDialog.querySelector('[data-choice="cancel"]').textContent=block?'OK':'Cancel';
  return new Promise(resolve=>{const done=v=>{stlDialog.close();resolve(v)};stlDialog.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>done(b.dataset.choice==='go'));stlDialog.oncancel=e=>{e.preventDefault();done(false)};stlDialog.showModal();stlDialog.querySelector('[data-choice="cancel"]').focus()});
}
let approvedStl=null;
if(typeof loadCustomTemplateFile==='function'){const prior=loadCustomTemplateFile;loadCustomTemplateFile=async function(file,...rest){
  if(!guardOn()||!file||file.size>CustomTemplate.MAX_BYTES||(typeof exportBusy!=='undefined'&&exportBusy))return prior.call(this,file,...rest);
  // Read only the header first: a refused model never costs the memory of loading it.
  let info;try{info=stlTriangles(new Uint8Array(await file.slice(0,84).arrayBuffer()),file.size)}catch{info={count:Math.round(file.size/250),estimated:true}}
  const name=file.name.replace(/\.stl$/i,'').slice(0,120)||'Custom STL';
  if(!(await askStl(info,name))){toast('Template not loaded','error');return}
  approvedStl=name;try{return await prior.call(this,file,...rest)}finally{approvedStl=null}}}
if(typeof useCustomTemplateBuffer==='function'){const prior=useCustomTemplateBuffer;useCustomTemplateBuffer=async function(buffer,name,...rest){
  if(!guardOn())return prior.call(this,buffer,name,...rest);
  const info=stlTriangles(buffer&&buffer.byteLength>=84?new Uint8Array(buffer,0,84):null,buffer?.byteLength||0);
  if(approvedStl!==name&&!(await askStl(info,name)))throw Error('\u201c'+name+'\u201d is too large to load on this phone ('+Math.round(info.count/1000)+'k triangles). Open the project on a computer.');
  store?.markHeavy('load',{name:String(name).slice(0,80),triangles:info.count});
  try{return await prior.call(this,buffer,name,...rest)}finally{store?.clearHeavy('load')}}}

// ======================= Export: guided when empty, autosave first, correct name =======================
const emptyDialog=el('dialog',{className:'product-dialog mobile-dialog',id:'phoneEmptyExport'});emptyDialog.setAttribute('aria-labelledby','phoneEmptyTitle');
emptyDialog.innerHTML='<h2 id="phoneEmptyTitle">No logo on the sleeve yet</h2><p>Add the customer\u2019s logo first, or export the plain ETSYFOLGER sleeve (with the bottom logo, if it is on).</p><div class="layer-actions"><button class="btn btn-primary" data-choice="add">Add logo</button><button class="btn btn-ghost" data-choice="blank">Export plain sleeve</button><button class="btn btn-ghost" data-choice="cancel">Cancel</button></div>';document.body.appendChild(emptyDialog);
function askEmpty(){return new Promise(resolve=>{const done=v=>{emptyDialog.close();resolve(v)};emptyDialog.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>done(b.dataset.choice));emptyDialog.oncancel=e=>{e.preventDefault();done('cancel')};emptyDialog.showModal();emptyDialog.querySelector('[data-choice="add"]').focus()})}
const priorExport=exportCurrent;
exportCurrent=async function(format,...rest){
  if(!isPhone()||(typeof exportBusy!=='undefined'&&exportBusy))return priorExport.call(this,format,...rest);
  if(templateActive()&&!artwork()){const c=await askEmpty();if(c==='add'){if(sheetOpen())setSettingsOpen(false);syncStart();start.querySelector('[data-add="photos"]')?.focus();return}if(c!=='blank')return}
  setPicking(false);
  try{await store?.flush()}catch{}// a reload during a heavy export then brings the design back
  const r=await priorExport.call(this,format,...rest);
  if(typeof exportBusy!=='undefined'&&exportBusy&&phoneDevice()){exportMarked=true;store?.markHeavy('export',{format})}
  return r};
// Name the relief of every side that has artwork: "emboss", "deboss", or e.g. "front-deboss_back-emboss".
const desktopReliefTag=exportReliefTag;
exportReliefTag=function(){
  if(!isPhone()||typeof designLayers==='undefined')return desktopReliefTag();
  if(typeof captureDesignSide==='function')captureDesignSide();
  const sides=designLayers.map(list=>{const r=new Set(list.filter(s=>s.image).map(s=>s.relief==='carved'?'deboss':'emboss'));return r.size?(r.size>1?'mixed':[...r][0]):null});
  const used=sides.filter(Boolean);if(!used.length)return desktopReliefTag();
  if(new Set(used).size===1&&used[0]!=='mixed')return used[0];
  return sides.map((t,i)=>t&&(i?'back':'front')+'-'+t).filter(Boolean).join('_');
};
// Phones without iOS's file-ready sheet (Android) also get Share first when the browser can share the file.
const priorDownload=downloadBlob;
downloadBlob=function(blob,filename){
  if(phoneDevice()&&!D.iOS&&typeof showFileReady==='function'&&typeof canShareFile==='function'&&canShareFile(new File([blob],filename,{type:blob.type||'application/octet-stream'}))){showFileReady(blob,filename);return}
  return priorDownload(blob,filename)};

// ======================= Glue =======================
function syncAll(){syncIrrelevant();syncStart();syncToolbar();if(isPhone())rememberRatio()}
if(typeof syncTemplateUI==='function'){const prior=syncTemplateUI;syncTemplateUI=function(...args){const r=prior.apply(this,args);syncAll();if(exportMarked&&!exportBusy){exportMarked=false;store?.clearHeavy('export')}return r}}
if(typeof syncDesignSides==='function'){const prior=syncDesignSides;syncDesignSides=function(...args){const r=prior.apply(this,args);syncAll();return r}}
{const prior=setSettingsOpen;setSettingsOpen=function(open,...rest){if(!open)setPicking(false);const r=prior.call(this,open,...rest);syncStart();return r}}
// Guide: on phones, mention that the design is kept on the device.
{const keep=[...(typeof guide!=='undefined'?guide.querySelectorAll('h3'):[])].find(h=>/Keep your work/.test(h.textContent));if(keep){const note=el('p',{className:'phone-guide-note'});note.textContent='On a phone, the design you are working on (artwork, placement, sides and settings) is also kept on the device and comes back after the page reloads. A custom STL template is not kept: import it again when asked. Start new design in the \u22ee menu clears it.';keep.nextElementSibling?.after(note)}}
function applyLayout(){if(isPhone())mountPhone();else unmountPhone();syncAll();if(!isPhone())clearViewOffset()}
const query=matchMedia(D.PHONE_QUERY);(query.addEventListener?query.addEventListener('change',applyLayout):query.addListener(applyLayout));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyLayout);else applyLayout();
// A heavy job that was running when the page went away (often an out-of-memory reload on a phone).
if(store){const notice=store.takeHeavyNotice();if(notice&&phoneDevice()){const what=notice.kind==='export'?'an export':'loading the template \u201c'+(notice.name||'custom STL')+'\u201d';setTimeout(()=>showBanner('The page reloaded during '+what+'. The phone probably ran out of memory. '+(store.enabled?'Your design was kept. ':'')+'For large models, use a computer'+(notice.kind==='export'?' or Phone-safe export quality.':'.'),[],true),1500)}}
})();
