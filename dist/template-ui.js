'use strict';
let templateBase=null,templateRayMesh=null,templatePreviewWorker=null,templatePreviewRunning=false,templatePending=null,templateRevision=0,templateMove=false,templatePreviewValid=true,templateActivePointer=null;
let builtinTemplateBase=null,builtinTemplateError=null;
const TEMPLATE_IDS=['etsyfolger-v1','custom-stl'];
function templateActive(){return TEMPLATE_IDS.includes(AppState.templateId)&&AppState.mode==='sleeve'}
// Overridden by custom-template-ui.js; the built-in template needs no extra job data.
function templateJobData(worker,quality){return undefined}
function templateInfo(){return{label:'ETSYFOLGER',file:'ETSYFOLGER',description:'Original cavity, openings and dimensions preserved.',surface:'ETSYFOLGER · curved surface',stats:'Original STL · '+(templateBase?Math.round(templateBase.height):89)+' mm tall',ready:'Your original sleeve is ready. Add an image, pattern or text.'}}
// Custom templates can be larger than the built-in sleeve; the built-in keeps its original slider ranges.
function placementLimit(id,min,max){if(!templateBase||AppState.templateId!=='custom-stl')return max;if(id==='designY')return Math.ceil(templateBase.height);if(id==='designHeight')return Math.max(min,Math.ceil(templateBase.height));if(id==='designWidth')return Math.max(160,Math.ceil(Math.min(3000,templateBase.chart?.perimeter||SleeveTemplate.profile(templateBase).perimeter)));return max}
function syncPlacementLimits(){for(const[id,,min,max]of placementSpecs){const lim=placementLimit(id,min,max);for(const suffix of ['Range','Number']){const el=$(id+suffix);if(el&&!(suffix==='Number'&&PLACEMENT_ANGLES.has(id)))el.max=String(lim)}}}
// Angles wrap instead of clamping: 200° is the same orientation as -160°, so clamping it to 180° would turn the
// design. Values inside [-180, 180] are kept as they are (both ends are valid). Rotation uses whole degrees so the
// slider, the number box and the stored value always agree.
const PLACEMENT_ANGLES=new Set(['designAngle','designRotation']);
function wrapDegrees(n){return n>180||n<-180?n-360*Math.ceil((n-180)/360):n}
function placementValue(id,n,min,max){if(id==='designRotation')n=Math.round(n);if(PLACEMENT_ANGLES.has(id))return wrapDegrees(n)||0;return Math.max(min,Math.min(placementLimit(id,min,max),n))}
function showPlacementValue(id){$(id+'Range').value=String(AppState[id]);$(id+'Number').value=String(id==='designAngle'?Math.round(AppState[id]*10)/10:AppState[id])}
function setActiveTemplateBase(base){
  templateBase=base;templateRevision++;templatePending=null;
  if(templatePreviewWorker){templatePreviewWorker.terminate();templatePreviewWorker=null;templatePreviewRunning=false}
  if(templateRayMesh){templateRayMesh.geometry.dispose();templateRayMesh.material.dispose();templateRayMesh=null}
  // Release the placement overlay's GPU resources; ensurePlacementMesh rebuilds them for the new surface.
  if(typeof placementMesh!=='undefined'&&placementMesh){scene?.remove(placementMesh);placementMesh.geometry.dispose();placementMesh.material.dispose();placementUniforms.arc.value?.dispose();placementTexture?.dispose();placementOtherTexture?.dispose();placementMesh=null;placementAtlasKey='';placementAtlasEntries=[];placementImageMap=null}
  if(base){templateRayMesh=new THREE.Mesh(MC.toThreeGeometry(base,THREE),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));templateRayMesh.updateMatrixWorld()}
  syncPlacementLimits();
}
function templateStatus(message,error=false){const el=$('templateStatus');if(el){el.textContent=message;el.classList.toggle('error',error)}}
function templateOptions(){return{sharp:AppState.uniformDepth&&AppState.crisp,templateId:AppState.templateId,designAngle:AppState.designAngle,designY:AppState.designY,designWidth:AppState.designWidth,designHeight:AppState.designHeight,designRotation:AppState.designRotation,maxHeight:AppState.depthMm,negative:AppState.relief==='carved',heightmap:AppState.heightmap,rows:AppState.hmRows,cols:AppState.hmCols}}
const placementSpecs=[['designAngle','Around sleeve',-180,180,1,'°'],['designY','Height from bottom',0,89,.5,'mm'],['designWidth','Design width',2,160,.5,'mm'],['designHeight','Design height',2,89,.5,'mm'],['designRotation','Design rotation',-180,180,1,'°']];
for(const[id,label,min,max,step,unit]of placementSpecs){const el=document.createElement('div');el.className='field placement-field';el.hidden=!['designWidth','designHeight','designRotation'].includes(id);el.innerHTML=`<div class="placement-label"><label for="${id}Range">${label}</label><div><input type="number" id="${id}Number" ${PLACEMENT_ANGLES.has(id)?'':`min="${min}" max="${max}" `}step="${step}" aria-label="${label} in ${unit}"><span>${unit}</span></div></div><input type="range" id="${id}Range" min="${min}" max="${max}" step="${step}">`;$('placementFields').appendChild(el);for(const suffix of ['Range','Number'])$(id+suffix).addEventListener('input',e=>{const n=Number(e.target.value);if(e.target.value===''||!Number.isFinite(n))return;const value=placementValue(id,n,min,max);if(value===AppState[id]&&suffix==='Number'){$(id+'Range').value=String(value);return}AppState[id]=value;$(id+(suffix==='Range'?'Number':'Range')).value=String(id==='designAngle'&&suffix==='Range'?Math.round(value*10)/10:value);updatePlacement()});
  // On commit (release, Enter, blur, spinner step) both controls show the stored value, e.g. 200 becomes -160.
  for(const suffix of ['Range','Number'])$(id+suffix).addEventListener('change',()=>{showPlacementValue(id);finishPlacement()});
  // Arrow keys continue past ±180 on angle sliders, as the angle itself does.
  if(PLACEMENT_ANGLES.has(id))$(id+'Range').addEventListener('keydown',e=>{const up=e.key==='ArrowRight'||e.key==='ArrowUp',down=e.key==='ArrowLeft'||e.key==='ArrowDown',v=Number(e.target.value);if(!(up&&v>=180)&&!(down&&v<=-180))return;e.preventDefault();e.target.value=String(up?-180+step:180-step);e.target.dispatchEvent(new Event('input',{bubbles:true}));e.target.dispatchEvent(new Event('change',{bubbles:true}))})}
function syncTemplateUI(){
  const active=templateActive();document.body.classList.toggle('using-template',active);$('templateChoice').value=AppState.templateId;
  els.depthIn.max=active?'3':'5';if(active&&AppState.depthMm>3){AppState.depthMm=3;els.depthIn.value='3';els.depthVal.textContent=(AppState.relief==='carved'?'↓ ':'↑ ')+'3.0'}els.depthIn.closest('.big-field').querySelector('.big-field-context span:last-child').textContent=active?'3 mm':'5 mm';
  $('templatePlacement').hidden=!active;$('designSizing').hidden=!active;$('templateToolbar').hidden=!active;$('templateDescription').textContent=TEMPLATE_IDS.includes(AppState.templateId)?templateInfo().description:'Dimensions generated from the selected elliptical preset.';
  for(const[id]of placementSpecs){$(id+'Range').value=String(AppState[id]);$(id+'Number').value=String(AppState[id])}$('uniformDepth').checked=AppState.uniformDepth;
  if(active){els.generateBtn.disabled=!templateBase||exportBusy;els.downloadObjBtn.disabled=!templateBase||exportBusy;document.querySelector('.canvas-meta span:last-child').textContent=templateInfo().surface;const tag=$('templateToolbar').querySelector('span');if(tag)tag.textContent=templateInfo().label.slice(0,24)}
  else{hidePlacementPreview();setTemplateMove(false);document.querySelector('.canvas-meta span:last-child').textContent='live preview'}
}
const originalProjectUI=projectStateToUI;projectStateToUI=function(){originalProjectUI();syncTemplateUI()};
const originalEmpty=setEmptyState;setEmptyState=function(empty){originalEmpty(empty);syncTemplateUI()};
const originalStats=updateStats;updateStats=function(){originalStats();if(templateActive()){els.statVol.textContent=templateInfo().stats;els.statQualityMode.textContent=AppState.uniformDepth&&AppState.crisp?'Clean contours · adaptive':'Print surface · 0.5 mm';els.statQuality.textContent=templatePreviewValid?(templateInfo().kept||'Original cavity kept'):'Check placement';els.statQuality.style.color=templatePreviewValid?'var(--success)':'var(--warning)'}};
const originalTemplateImage=setDesignImage;setDesignImage=function(img,label){if(templateActive()){AppState.designHeight=Math.min(75,AppState.designWidth*img.height/img.width);AppState.logoSizePct=100}originalTemplateImage(img,label);syncTemplateUI()};
function replaceTemplateMesh(positions,indices,amplitude,walls){
  if(!scene)return;hidePlacementPreview();let geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(new THREE.BufferAttribute(indices instanceof Uint32Array?indices:new Uint32Array(indices),1));if(!walls?.length)geometry.computeVertexNormals();if(walls?.length){geometry.dispose();geometry=createSharpGeometry(positions,indices,walls,amplitude)}
  const material=new THREE.MeshStandardMaterial({color:0xd2cec5,metalness:.08,roughness:.48,side:THREE.DoubleSide});
  if(walls?.length){material.color.setHex(0xffffff);material.vertexColors=true}
  if(amplitude&&!walls?.length){const colors=new Float32Array(positions.length);for(let i=0;i<amplitude.length;i++){const t=Math.min(1,amplitude[i]*1.2);colors[i*3]=.72+.28*t;colors[i*3+1]=.70*(1-t)+.29*t;colors[i*3+2]=.66*(1-t)+.035*t}geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));material.color.setHex(0xffffff);material.vertexColors=true}
  if(meshObj){scene.remove(meshObj);meshObj.geometry.dispose();disposeMaterial(meshObj.material)}meshObj=new THREE.Mesh(geometry,material);scene.add(meshObj);previewMesh={positions,indices};
}
function renderTemplateBlank(){hidePlacementPreview();if(!templateActive()||!templateBase||!scene)return;templateRevision++;templatePending=null;templatePreviewValid=true;replaceTemplateMesh(new Float32Array(templateBase.positions),templateBase.indices);AppState.lastValidation={triCount:templateBase.indices.length/3,boundary:0,nonManifold:0,zeroArea:0};templateStatus(templateInfo().ready);syncTemplateUI();updateStats()}
function ensurePreviewWorker(){
  if(templatePreviewWorker)return;templatePreviewWorker=new Worker('template-worker.js');
  templatePreviewWorker.onmessage=({data})=>{templatePreviewRunning=false;if(data.id===templateRevision&&templateActive()){if(typeof reportBottomPreview==='function')reportBottomPreview(data);if(data.error){templatePreviewValid=false;templateStatus(data.error,true)}else{templatePreviewValid=true;replaceTemplateMesh(data.positions,data.indices,data.amplitude,data.walls);AppState.lastValidation={triCount:data.indices.length/3,boundary:0,nonManifold:0,zeroArea:0};const extra=(data.info.raised?' Embossed designs are raised above the surface texture.':'')+(data.info.textureDeboss?' Deboss only reaches the smooth parts of this textured surface; use Emboss for a continuous design.':'')+(data.info.sharp?' Clean contours enabled.':'')+(data.info.clipped?' Parts near rims or openings are protected.':'');templateStatus(data.info.affected?`Designs follow the sleeve surface with their own depth and finish.${extra}`:data.info.textureDeboss?'Deboss cannot be cut into this textured surface. Use Emboss; embossed designs are raised above the texture.':'No relief is on the sleeve. Move the design or adjust background removal.',!data.info.affected||!!data.info.textureDeboss);updateStats()}}dispatchPreview()};
  // A worker that crashed (often out of memory on phones) is replaced on the next request.
  const worker=templatePreviewWorker;worker.onerror=e=>{e?.preventDefault?.();console.warn('Preview worker failed:',e?.message||'unknown error');worker.terminate();if(templatePreviewWorker!==worker)return;templatePreviewRunning=false;templatePreviewWorker=null;templatePreviewValid=false;templateStatus('Preview could not finish. Change a setting to retry.',true)};
}
function dispatchPreview(){if(templatePreviewRunning||!templatePending)return;ensurePreviewWorker();templatePreviewRunning=true;const job=templatePending;templatePending=null;job.template=templateJobData(templatePreviewWorker,'preview');templatePreviewWorker.postMessage(job)}
function requestTemplatePreview(){if(!templateBase||!templateActive())return;if(!hasSleeveArtwork()){renderTemplateBlank();return}const id=++templateRevision;templatePending={id,type:'preview',options:templateOptions()};templateStatus('Forming your design along the sleeve…');syncTemplateUI();dispatchPreview()}
function setTemplateMove(value){templateMove=!!value&&templateActive();$('moveDesign').setAttribute('aria-pressed',String(templateMove));$('moveDesign').textContent=templateMove?'Moving design · click to orbit':'Move design on sleeve';document.body.classList.toggle('moving-template-design',templateMove);if(controls)controls.enabled=!templateMove}
function templateView(which){if(!camera||!controls||!templateBase)return;const target=new THREE.Vector3(0,templateBase.height/2,0),d=({front:[0,0,1],back:[0,0,-1],left:[-1,0,0],right:[1,0,0]})[which];let dist=AppState.templateId==='custom-stl'&&templateBase.bounds?Math.max(155,2.2*Math.max(templateBase.height,templateBase.bounds.max[0]-templateBase.bounds.min[0],templateBase.bounds.max[2]-templateBase.bounds.min[2])):155;dist*=Math.max(1,Math.min(1.6,.9/(camera.aspect||1)));// narrow (portrait phone) views back off so the sleeve fits
 camera.position.set(target.x+d[0]*dist,target.y+d[1]*dist,target.z+d[2]*dist);controls.target.copy(target);camera.lookAt(target);controls.update()}
let templateGrabOffset=null,wheelGrabRestoreMove=null;
function templateSurfaceHit(e){
 if(!templateRayMesh||!camera)return null;const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hit=ray.intersectObject(templateRayMesh,false)[0];if(!hit)return null;const p=hit.point,n=hit.face.normal,radial=new THREE.Vector3(p.x,0,p.z).normalize();return n.dot(radial)<.25||Math.abs(n.y)>.78?null:p;
}
function placeFromPointer(e){
 const p=templateSurfaceHit(e);if(!p)return false;
 let angle=Math.atan2(p.z,p.x),y=p.y;
 if(templateGrabOffset){const chart=templateGrabOffset.chart;angle=SleeveTemplate.angleAt(chart,SleeveTemplate.arcAt(chart,angle)+templateGrabOffset.arc);y+=templateGrabOffset.y;}
 AppState.designAngle=((angle*180/Math.PI-90+540)%360)-180;AppState.designY=Math.max(0,Math.min(templateBase.height,y));for(const id of ['designAngle','designY']){$(id+'Range').value=String(AppState[id]);$(id+'Number').value=String(Math.round(AppState[id]*10)/10)}updatePlacement();dirty();return true;
}
// Touch: dragging the selected design moves it (the touch version of the middle-button grab); a drag anywhere
// else orbits, two fingers pinch-zoom and pan. A second finger during a grab that has not moved yet cancels it,
// so a pinch that happens to start on the design still zooms.
let templateGrabTouch=false,templateGrabMoved=false,templateGrabStart={x:0,y:0};
function installLogoPointerControls(canvas){
 canvas.addEventListener('pointerdown',e=>{
  if(templateActivePointer!==null&&templateGrabTouch&&e.pointerId!==templateActivePointer){
   if(!templateGrabMoved){cancelTouchGrab(canvas);return}
   e.preventDefault();e.stopImmediatePropagation();return;
  }
  const touchGrab=e.pointerType!=='mouse'&&e.isPrimary&&e.button===0&&!templateMove&&typeof touchHitsSelectedDesign==='function'&&templateActive()&&!exportBusy&&touchHitsSelectedDesign(e);
  if((e.button===1||touchGrab)&&templateActive()&&!exportBusy){
   const priorMove=templateMove;
   if(!selectLogoAtPointer(e,false))return;const p=templateSurfaceHit(e);if(!p)return;ensurePlacementMesh();const chart=placementMesh.userData.chart;
   templateGrabOffset={chart,arc:SleeveTemplate.arcAt(chart,(AppState.designAngle||0)*Math.PI/180+Math.PI/2)-SleeveTemplate.arcAt(chart,Math.atan2(p.z,p.x)),y:AppState.designY-p.y};wheelGrabRestoreMove=priorMove;
   templateGrabTouch=!!touchGrab;templateGrabMoved=false;templateGrabStart={x:e.clientX,y:e.clientY,t:e.timeStamp||0};
   e.preventDefault();e.stopImmediatePropagation();setTemplateMove(true);templateActivePointer=e.pointerId;canvas.setPointerCapture(e.pointerId);templateStatus(touchGrab?'Moving design · lift your finger to place it.':'Moving logo · release the scroll wheel to place it.');return;
  }
  if(!templateMove||e.button!==0||exportBusy)return;e.preventDefault();e.stopImmediatePropagation();if(templateActivePointer!==null)return;if(placeFromPointer(e)){templateActivePointer=e.pointerId;templateGrabTouch=false;canvas.setPointerCapture(e.pointerId)}else templateStatus('Place the design on the outside wall of the sleeve.',true);
 },true);
 canvas.addEventListener('pointermove',e=>{if(!templateMove||templateActivePointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();if(templateGrabTouch&&!templateGrabMoved&&Math.hypot(e.clientX-templateGrabStart.x,e.clientY-templateGrabStart.y)<6)return;templateGrabMoved=true;queuePlacementPointer(e);},true);
 const end=e=>{if(templateActivePointer!==e.pointerId)return;e.preventDefault?.();e.stopImmediatePropagation?.();
  // A touch that never moved is a tap on the selected design: nothing to place, so no detailed rebuild either.
  if(templateGrabTouch&&!templateGrabMoved){if(placementFrame!==null)cancelAnimationFrame(placementFrame);placementFrame=null;placementPointer=null;templateStatus('Drag the selected design to move it · drag elsewhere to orbit.');if(e.clientX!==undefined&&typeof selectedDesignTapped==='function')selectedDesignTapped(e,templateGrabStart.t||undefined)}else flushPlacementPointer();
  templateActivePointer=null;templateGrabOffset=null;templateGrabTouch=false;const prior=wheelGrabRestoreMove;wheelGrabRestoreMove=null;if(prior!==null)setTemplateMove(prior);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
 const cancelTouchGrab=canvas=>{const id=templateActivePointer;templateGrabMoved=false;end({pointerId:id});};
 canvas.addEventListener('pointerup',end,true);canvas.addEventListener('pointercancel',end,true);canvas.addEventListener('lostpointercapture',end);
 // While a design is held, the browser must not turn the finger into a scroll, zoom or orbit gesture.
 canvas.addEventListener('touchmove',e=>{if(templateActivePointer!==null&&templateMove)e.preventDefault();},{passive:false,capture:true});
 canvas.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
 window.addEventListener('blur',()=>{if(templateActivePointer!==null)end({pointerId:templateActivePointer});});
}

async function showTemplate(){
  let controlsInstalled=false;const install=()=>{if(!controlsInstalled&&renderer){controlsInstalled=true;installLogoPointerControls(renderer.domElement)}};
  try{const response=await fetch('templates/ETSYFOLGER.stl');if(!response.ok)throw Error('Sleeve template could not be loaded.');builtinTemplateBase=SleeveTemplate.parse(await response.arrayBuffer());install();
    if(AppState.templateId==='custom-stl')return;setActiveTemplateBase(builtinTemplateBase);
    if(templateActive()){if(AppState.image)scheduleRebuild(true);else renderTemplateBlank();templateView('front')}syncTemplateUI();
  }catch(error){install();builtinTemplateError=error;if(AppState.templateId==='custom-stl')return;templateStatus(error.message,true);toast(error.message,'error')}
}
$('moveDesign').onclick=()=>setTemplateMove(!templateMove);
$('templateChoice').onchange=e=>{if(typeof beforeTemplateChoice==='function'&&beforeTemplateChoice(e.target.value)===false){e.target.value=AppState.templateId;return}AppState.templateId=e.target.value;AppState.mode='sleeve';projectStateToUI();if(templateActive())AppState.image?scheduleRebuild(true):renderTemplateBlank();else if(AppState.image)scheduleRebuild(true);else{if(meshObj){scene.remove(meshObj);meshObj.geometry.dispose();disposeMaterial(meshObj.material);meshObj=null}setEmptyState(true)}saveSettings();dirty()};
$('uniformDepth').onchange=e=>{AppState.uniformDepth=e.target.checked;scheduleRebuild();saveSettings()};
$('centerDesign').onclick=()=>{AppState.designAngle=0;AppState.designY=templateBase?templateBase.height/2:44.5;AppState.designRotation=0;projectStateToUI();scheduleRebuild();saveSettings();dirty()};
$('clearDesign').onclick=()=>{AppState.image=null;AppState.heightmap=null;AppState.alphaMap=null;AppState.imageName='';AppState.sourceLabel='—';AppState.hmRows=0;AppState.hmCols=0;AppState.text='';AppState.textRenderId++;els.textInput.value='';els.fileName.style.display='none';els.textStretchField.style.display='none';els.heightmapCanvas.getContext('2d').clearRect(0,0,els.heightmapCanvas.width,els.heightmapCanvas.height);drawHeightmapPreview();renderTemplateBlank();dirty()};
document.querySelectorAll('[data-template-view]').forEach(button=>button.onclick=()=>templateView(button.dataset.templateView));
async function exportTemplate(format){
  if(exportBusy||!templateBase)return;exportBusy=true;syncTemplateUI();els.generateBtn.textContent='Forming export…';templateStatus('Preparing the full sleeve with your current design…');const worker=new Worker('template-worker.js');let timeout,ticker;
  // The worker reports each stage; show it with the elapsed time so a long export never looks frozen. The watchdog
  // only fires when the worker has gone quiet for five minutes, not after a fixed total.
  const started=performance.now(),elapsed=()=>Math.round((performance.now()-started)/1000)+' s';let stageText='Preparing the full sleeve with your current design';
  const showStage=()=>{if(!exportBusy)return;els.generateBtn.textContent='Forming export… '+elapsed();templateStatus(stageText+'… '+elapsed())};
  const watchdog=()=>{clearTimeout(timeout);timeout=setTimeout(()=>{finish();templateStatus('Export stopped responding. Try a smaller design or close other busy tabs.',true)},300000)};
  const finish=()=>{clearTimeout(timeout);clearInterval(ticker);worker.terminate();exportBusy=false;els.generateBtn.textContent='Export STL';syncTemplateUI()};
  ticker=setInterval(showStage,1000);
  try{const options=templateOptions(1024);
    const filename=safeFilename()+'_'+templateInfo().file+'_'+(hasSleeveArtwork()?(AppState.relief==='carved'?'deboss':'emboss'):'plain')+'.'+format;
    worker.onmessage=({data})=>{if(data.progress){watchdog();stageText=data.exportStage?'Export: '+data.progress:'Preparing the print surface for your template: '+data.progress;showStage();return}finish();if(data.error){const message=data.error+(/open edges|non-manifold|Repair could not/.test(data.error)&&templateInfo().exportHint?' '+templateInfo().exportHint:'');templateStatus(message,true);toast(data.error,'error');return}downloadBlob(new Blob([format==='obj'?data.text:data.buffer],{type:format==='obj'?'model/obj':'model/stl'}),filename);templateStatus('Exported '+data.validation.triCount.toLocaleString()+' triangles.'+(data.info.sharp?' Contour spacing: '+data.info.spacing.toFixed(2)+' mm'+(data.info.adapted?' (adjusted for this large design)':'')+'.':'')+' '+(AppState.templateId==='custom-stl'?'Template geometry preserved outside the artwork':'Original cavity preserved')+'; inspect in your slicer.');toast('Sleeve '+format.toUpperCase()+' exported','success')};worker.onerror=()=>{finish();templateStatus('Export failed. Reload and try again.',true)};watchdog();worker.postMessage({id:1,type:'export',format,options,repair:repairOnExport,template:templateJobData(worker,'print')});
  }catch(error){finish();templateStatus(error.message,true)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showTemplate);else showTemplate();
