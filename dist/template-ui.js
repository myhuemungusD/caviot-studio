'use strict';
let templateBase=null,templateRayMesh=null,templatePreviewWorker=null,templatePreviewRunning=false,templatePending=null,templateRevision=0,templateMove=false,templatePreviewValid=true,templateActivePointer=null;
function templateActive(){return AppState.templateId==='etsyfolger-v1'&&AppState.mode==='sleeve'}
function templateStatus(message,error=false){const el=$('templateStatus');if(el){el.textContent=message;el.classList.toggle('error',error)}}
function templateOptions(){return{sharp:AppState.uniformDepth&&AppState.crisp,templateId:AppState.templateId,designAngle:AppState.designAngle,designY:AppState.designY,designWidth:AppState.designWidth,designHeight:AppState.designHeight,designRotation:AppState.designRotation,maxHeight:AppState.depthMm,negative:AppState.relief==='carved',heightmap:AppState.heightmap,rows:AppState.hmRows,cols:AppState.hmCols}}
const placementSpecs=[['designAngle','Around sleeve',-180,180,1,'°'],['designY','Height from bottom',0,89,.5,'mm'],['designWidth','Design width',2,160,.5,'mm'],['designHeight','Design height',2,89,.5,'mm'],['designRotation','Design rotation',-180,180,1,'°']];
for(const[id,label,min,max,step,unit]of placementSpecs){const el=document.createElement('div');el.className='field placement-field';el.hidden=!['designWidth','designHeight','designRotation'].includes(id);el.innerHTML=`<div class="placement-label"><label for="${id}Range">${label}</label><div><input type="number" id="${id}Number" min="${min}" max="${max}" step="${step}" aria-label="${label} in ${unit}"><span>${unit}</span></div></div><input type="range" id="${id}Range" min="${min}" max="${max}" step="${step}">`;$('placementFields').appendChild(el);for(const suffix of ['Range','Number'])$(id+suffix).addEventListener('input',e=>{const n=Number(e.target.value);if(e.target.value===''||!Number.isFinite(n))return;AppState[id]=Math.max(min,Math.min(max,n));$(id+(suffix==='Range'?'Number':'Range')).value=String(AppState[id]);updatePlacement()});for(const suffix of ['Range','Number'])$(id+suffix).addEventListener('change',finishPlacement)}
function syncTemplateUI(){
  const active=templateActive();document.body.classList.toggle('using-template',active);$('templateChoice').value=AppState.templateId;
  els.depthIn.max=active?'3':'5';if(active&&AppState.depthMm>3){AppState.depthMm=3;els.depthIn.value='3';els.depthVal.textContent=(AppState.relief==='carved'?'↓ ':'↑ ')+'3.0'}els.depthIn.closest('.big-field').querySelector('.big-field-context span:last-child').textContent=active?'3 mm':'5 mm';
  $('templatePlacement').hidden=!active;$('designSizing').hidden=!active;$('templateToolbar').hidden=!active;$('templateDescription').textContent=AppState.templateId==='etsyfolger-v1'?'Original cavity, openings and dimensions preserved.':'Dimensions generated from the selected elliptical preset.';
  for(const[id]of placementSpecs){$(id+'Range').value=String(AppState[id]);$(id+'Number').value=String(AppState[id])}$('uniformDepth').checked=AppState.uniformDepth;$('templateStart').hidden=!active||!!AppState.image;
  if(active){els.threeEmpty.style.display='none';els.generateBtn.disabled=!templateBase||exportBusy;els.downloadObjBtn.disabled=!templateBase||exportBusy;document.querySelector('.canvas-meta span:last-child').textContent='ETSYFOLGER · curved surface'}
  else{hidePlacementPreview();setTemplateMove(false);document.querySelector('.canvas-meta span:last-child').textContent='live preview'}
}
const originalProjectUI=projectStateToUI;projectStateToUI=function(){originalProjectUI();syncTemplateUI()};
const originalEmpty=setEmptyState;setEmptyState=function(empty){originalEmpty(empty);syncTemplateUI()};
const originalStats=updateStats;updateStats=function(){originalStats();if(templateActive()){els.statVol.textContent='Original STL · 89 mm tall';els.statQualityMode.textContent=AppState.uniformDepth&&AppState.crisp?'Clean contours · adaptive':'Print surface · 0.5 mm';els.statQuality.textContent=templatePreviewValid?'Original cavity kept':'Check placement';els.statQuality.style.color=templatePreviewValid?'var(--success)':'var(--warning)'}};
const originalTemplateImage=setDesignImage;setDesignImage=function(img,label){if(templateActive()){AppState.designHeight=Math.min(75,AppState.designWidth*img.height/img.width);AppState.logoSizePct=100}originalTemplateImage(img,label);syncTemplateUI()};
function replaceTemplateMesh(positions,indices,amplitude,walls){
  if(!scene)return;hidePlacementPreview();let geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(new THREE.BufferAttribute(indices instanceof Uint32Array?indices:new Uint32Array(indices),1));if(!walls?.length)geometry.computeVertexNormals();if(walls?.length){geometry.dispose();geometry=createSharpGeometry(positions,indices,walls,amplitude)}
  const material=new THREE.MeshStandardMaterial({color:0xd2cec5,metalness:.08,roughness:.48,side:THREE.DoubleSide});
  if(walls?.length){material.color.setHex(0xffffff);material.vertexColors=true}
  if(amplitude&&!walls?.length){const colors=new Float32Array(positions.length);for(let i=0;i<amplitude.length;i++){const t=Math.min(1,amplitude[i]*1.2);colors[i*3]=.72+.28*t;colors[i*3+1]=.70*(1-t)+.29*t;colors[i*3+2]=.66*(1-t)+.035*t}geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));material.color.setHex(0xffffff);material.vertexColors=true}
  if(meshObj){scene.remove(meshObj);meshObj.geometry.dispose();disposeMaterial(meshObj.material)}meshObj=new THREE.Mesh(geometry,material);scene.add(meshObj);previewMesh={positions,indices};els.threeEmpty.style.display='none';
}
function renderTemplateBlank(){hidePlacementPreview();if(!templateActive()||!templateBase||!scene)return;templateRevision++;templatePending=null;templatePreviewValid=true;replaceTemplateMesh(new Float32Array(templateBase.positions),templateBase.indices);AppState.lastValidation={triCount:templateBase.indices.length/3,boundary:0,nonManifold:0,zeroArea:0};templateStatus('Your original sleeve is ready. Add an image, pattern or text.');syncTemplateUI();updateStats()}
function ensurePreviewWorker(){
  if(templatePreviewWorker)return;templatePreviewWorker=new Worker('template-worker.js');
  templatePreviewWorker.onmessage=({data})=>{templatePreviewRunning=false;if(data.id===templateRevision&&templateActive()){if(typeof reportBottomPreview==='function')reportBottomPreview(data);if(data.error){templatePreviewValid=false;templateStatus(data.error,true)}else{templatePreviewValid=true;replaceTemplateMesh(data.positions,data.indices,data.amplitude,data.walls);AppState.lastValidation={triCount:data.indices.length/3,boundary:0,nonManifold:0,zeroArea:0};const extra=(data.info.sharp?' Clean contours enabled.':'')+(data.info.clipped?' Parts near rims or openings are protected.':'');templateStatus(data.info.affected?`Designs follow the sleeve surface with their own depth and finish.${extra}`:'No relief is on the sleeve. Move the design or adjust background removal.',!data.info.affected);updateStats()}}dispatchPreview()};
  templatePreviewWorker.onerror=()=>{templatePreviewRunning=false;templatePreviewWorker.terminate();templatePreviewWorker=null;templatePreviewValid=false;templateStatus('Preview could not finish. Change a setting to retry.',true)};
}
function dispatchPreview(){if(templatePreviewRunning||!templatePending)return;ensurePreviewWorker();templatePreviewRunning=true;const job=templatePending;templatePending=null;templatePreviewWorker.postMessage(job)}
function requestTemplatePreview(){if(!templateBase||!templateActive())return;if(!hasSleeveArtwork()){renderTemplateBlank();return}const id=++templateRevision;templatePending={id,type:'preview',options:templateOptions()};templateStatus('Forming your design along the sleeve…');syncTemplateUI();dispatchPreview()}
function setTemplateMove(value){templateMove=!!value&&templateActive();$('moveDesign').setAttribute('aria-pressed',String(templateMove));$('moveDesign').textContent=templateMove?'Moving design · click to orbit':'Move design on sleeve';document.body.classList.toggle('moving-template-design',templateMove);if(controls)controls.enabled=!templateMove}
function templateView(which){if(!camera||!controls||!templateBase)return;const target=new THREE.Vector3(0,templateBase.height/2,0),d=({front:[0,0,1],back:[0,0,-1],left:[-1,0,0],right:[1,0,0]})[which];camera.position.set(target.x+d[0]*155,target.y+d[1]*155,target.z+d[2]*155);controls.target.copy(target);camera.lookAt(target);controls.update()}
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
function installLogoPointerControls(canvas){
 canvas.addEventListener('pointerdown',e=>{
  if(e.button===1&&templateActive()&&!exportBusy){
   const priorMove=templateMove;
   if(!selectLogoAtPointer(e,false))return;const p=templateSurfaceHit(e);if(!p)return;ensurePlacementMesh();const chart=placementMesh.userData.chart;
   templateGrabOffset={chart,arc:SleeveTemplate.arcAt(chart,(AppState.designAngle||0)*Math.PI/180+Math.PI/2)-SleeveTemplate.arcAt(chart,Math.atan2(p.z,p.x)),y:AppState.designY-p.y};wheelGrabRestoreMove=priorMove;
   e.preventDefault();e.stopImmediatePropagation();setTemplateMove(true);templateActivePointer=e.pointerId;canvas.setPointerCapture(e.pointerId);templateStatus('Moving logo · release the scroll wheel to place it.');return;
  }
  if(!templateMove||e.button!==0||exportBusy)return;e.preventDefault();e.stopImmediatePropagation();if(placeFromPointer(e)){templateActivePointer=e.pointerId;canvas.setPointerCapture(e.pointerId)}else templateStatus('Place the design on the outside wall of the sleeve.',true);
 },true);
 canvas.addEventListener('pointermove',e=>{if(!templateMove||templateActivePointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();queuePlacementPointer(e);},true);
 const end=e=>{if(templateActivePointer!==e.pointerId)return;e.preventDefault?.();e.stopImmediatePropagation?.();flushPlacementPointer();templateActivePointer=null;templateGrabOffset=null;const prior=wheelGrabRestoreMove;wheelGrabRestoreMove=null;if(prior!==null)setTemplateMove(prior);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
 canvas.addEventListener('pointerup',end,true);canvas.addEventListener('pointercancel',end,true);canvas.addEventListener('lostpointercapture',end);
 canvas.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
 window.addEventListener('blur',()=>{if(templateActivePointer!==null)end({pointerId:templateActivePointer});});
}

async function showTemplate(){
  try{const response=await fetch('templates/ETSYFOLGER.stl');if(!response.ok)throw Error('Sleeve template could not be loaded.');templateBase=SleeveTemplate.parse(await response.arrayBuffer());
    templateRayMesh=new THREE.Mesh(MC.toThreeGeometry(templateBase,THREE),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));templateRayMesh.updateMatrixWorld();
    if(templateActive()){if(AppState.image)scheduleRebuild(true);else renderTemplateBlank();templateView('front')}syncTemplateUI();
    if(renderer)installLogoPointerControls(renderer.domElement);
  }catch(error){templateStatus(error.message,true);toast(error.message,'error')}
}
$('moveDesign').onclick=()=>setTemplateMove(!templateMove);
$('templateChoice').onchange=e=>{AppState.templateId=e.target.value;AppState.mode='sleeve';projectStateToUI();if(templateActive())AppState.image?scheduleRebuild(true):renderTemplateBlank();else if(AppState.image)scheduleRebuild(true);else{if(meshObj){scene.remove(meshObj);meshObj.geometry.dispose();disposeMaterial(meshObj.material);meshObj=null}setEmptyState(true)}saveSettings();dirty()};
$('uniformDepth').onchange=e=>{AppState.uniformDepth=e.target.checked;scheduleRebuild();saveSettings()};
$('centerDesign').onclick=()=>{AppState.designAngle=0;AppState.designY=templateBase?.height/2||44.5;AppState.designRotation=0;projectStateToUI();scheduleRebuild();saveSettings();dirty()};
$('clearDesign').onclick=()=>{AppState.image=null;AppState.heightmap=null;AppState.alphaMap=null;AppState.imageName='';AppState.sourceLabel='—';AppState.hmRows=0;AppState.hmCols=0;AppState.text='';AppState.textRenderId++;els.textInput.value='';els.fileName.style.display='none';els.textStretchField.style.display='none';els.heightmapCanvas.getContext('2d').clearRect(0,0,els.heightmapCanvas.width,els.heightmapCanvas.height);drawHeightmapPreview();renderTemplateBlank();dirty()};
$('templateUpload').onclick=()=>els.fileInput.click();
$('templateSample').onclick=()=>{AppState.text='YOUR LOGO';els.textInput.value=AppState.text;AppState.bgEnable=true;AppState.uniformDepth=true;AppState.designWidth=42;projectStateToUI();applyTextDesign()};
document.querySelectorAll('[data-template-view]').forEach(button=>button.onclick=()=>templateView(button.dataset.templateView));
async function exportTemplate(format){
  if(exportBusy||!templateBase)return;exportBusy=true;syncTemplateUI();els.generateBtn.textContent='Forming export…';templateStatus('Preparing the full sleeve with your current design… Detailed artwork can take a few minutes.');const worker=new Worker('template-worker.js');let timeout;
  const finish=()=>{clearTimeout(timeout);worker.terminate();exportBusy=false;els.generateBtn.textContent='Export STL';syncTemplateUI()};
  try{const options=templateOptions(1024);
    const filename=safeFilename()+'_ETSYFOLGER_'+(hasSleeveArtwork()?(AppState.relief==='carved'?'deboss':'emboss'):'plain')+'.'+format;
    worker.onmessage=({data})=>{finish();if(data.error){templateStatus(data.error,true);toast(data.error,'error');return}downloadBlob(new Blob([format==='obj'?data.text:data.buffer],{type:format==='obj'?'model/obj':'model/stl'}),filename);templateStatus('Exported '+data.validation.triCount.toLocaleString()+' triangles.'+(data.info.sharp?' Contour spacing: '+data.info.spacing.toFixed(2)+' mm'+(data.info.adapted?' (adjusted for this large design)':'')+'.':'')+' Original cavity preserved; inspect in your slicer.');toast('Sleeve '+format.toUpperCase()+' exported','success')};worker.onerror=()=>{finish();templateStatus('Export failed. Reload and try again.',true)};timeout=setTimeout(()=>{finish();templateStatus('Export took too long. Try a smaller design or close other busy tabs.',true)},300000);worker.postMessage({id:1,type:'export',format,options,repair:repairOnExport});
  }catch(error){finish();templateStatus(error.message,true)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showTemplate);else showTemplate();
