'use strict';
// Artwork slots are independent; relief finish and depth belong to the sleeve.
const SIDE_KEYS=['designAngle','designY','designWidth','designHeight','designRotation','bgEnable','bgR','bgG','bgB','bgTol','bgSoft','mirror','invert','smoothPasses','text','letterSpacing','letterThickness','customFontFamily'];
const SIDE_RUNTIME=['image','imageName','sourceLabel','heightmap','hmRows','hmCols','alphaMap','mask'];
let activeDesignSide=0,designSides=[null,null],linkedSideSettings=false;
function emptyDesignSide(index){return {designAngle:index?180:0,designY:44.5,designWidth:30,designHeight:30,designRotation:0,bgEnable:true,bgR:255,bgG:255,bgB:255,bgTol:40,bgSoft:false,mirror:false,invert:true,smoothPasses:0,text:'',letterSpacing:0,letterThickness:0,customFontFamily:AppState.customFontFamily,image:null,imageName:'',sourceLabel:'—',heightmap:null,hmRows:0,hmCols:0,alphaMap:null,mask:null,fontChoice:els.fontChoice.value};}
function captureDesignSide(){const slot=designSides[activeDesignSide]||(designSides[activeDesignSide]=emptyDesignSide(activeDesignSide));for(const key of [...SIDE_KEYS,...SIDE_RUNTIME])slot[key]=AppState[key];slot.fontChoice=els.fontChoice.value;
 if(linkedSideSettings){const other=1-activeDesignSide,target=designSides[other]||(designSides[other]=emptyDesignSide(other));for(const key of SIDE_KEYS.filter(k=>!['text','letterSpacing','letterThickness','customFontFamily'].includes(k)))target[key]=slot[key];target.designAngle=((slot.designAngle+360)%360)-180;}
 return slot;}
function hasSleeveArtwork(){return !!AppState.image||!!designSides[1-activeDesignSide]?.image;}
function sideRaster(slot,detail){
 const settings={...AppState,...slot},key=JSON.stringify([detail,...SIDE_KEYS.filter(k=>!k.startsWith('design')&&k!=='text'&&k!=='customFontFamily').map(k=>settings[k]),settings.uniformDepth,settings.crisp]);
 if(!slot.cache||slot.cache.image!==slot.image||slot.cache.key!==key){const built=buildHeightmapAtDetail(detail,slot.image,settings);slot.cache={image:slot.image,key,built};}
 return slot.cache.built;
}
function sleeveDesignOptions(detail=768){
 captureDesignSide();return designSides.filter(s=>s?.image).map(slot=>{const built=sideRaster(slot,detail);return {designAngle:slot.designAngle,designY:slot.designY,designWidth:slot.designWidth,designHeight:slot.designHeight,designRotation:slot.designRotation,heightmap:built.hm,rows:built.rows,cols:built.cols}});
}
function syncDesignSides(){
 $('designSidesPanel').hidden=!templateActive();
 for(let i=0;i<2;i++){const has=i===activeDesignSide?!!AppState.image:!!designSides[i]?.image;const button=$('editSide'+i);button.setAttribute('aria-pressed',String(i===activeDesignSide));button.textContent=(i?'Back':'Front')+(has?' · design':' · empty');button.disabled=exportBusy;}
 $('copyDesignSide').disabled=!AppState.image||exportBusy;$('copyDesignSide').textContent='Copy '+(activeDesignSide?'back to front':'front to back');
 els.depthIn.closest('.big-field').querySelector('.big-field-label').textContent=templateActive()?'Depth · both sides':'Depth';
 $('centerDesign').textContent='Center on '+(activeDesignSide?'back':'front');$('clearDesign').textContent='Clear '+(activeDesignSide?'back':'front');
 $('linkDesignSettings').checked=linkedSideSettings;$('sideLinkHelp').textContent=linkedSideSettings?'Size, position and image settings match on opposite sides. Artwork stays separate.':'Click a logo to edit it. Each side has its own size, position and image settings.';
 if(els.letterSpacingIn){els.letterSpacingIn.value=AppState.letterSpacing;els.letterSpacingVal.textContent=String(AppState.letterSpacing);}if(els.letterThicknessIn){els.letterThicknessIn.value=AppState.letterThickness;els.letterThicknessVal.textContent=String(AppState.letterThickness);}if(els.textStretchField)els.textStretchField.style.display=AppState.text?.trim()?'block':'none';
 $('editingSideLabel').textContent='Editing '+(activeDesignSide?'back':'front')+' artwork';
}
function switchDesignSide(index,turnView=true){
 if(index===activeDesignSide||exportBusy)return;const needsBuild=!!AppState.rebuildTimer||!!placementTimer;captureDesignSide();clearTimeout(AppState.rebuildTimer);AppState.rebuildTimer=null;hidePlacementPreview();setTemplateMove(false);AppState.textRenderId++;builtinSelectionRevision++;
 activeDesignSide=index;const slot=designSides[index]||(designSides[index]=emptyDesignSide(index));for(const key of [...SIDE_KEYS,...SIDE_RUNTIME])AppState[key]=slot[key];
 builtinSelection=slot.fontChoice?.startsWith('builtin:')||slot.fontChoice==='system'?slot.fontChoice:'';els.fontChoice.value=slot.fontChoice||'system';els.textInput.value=AppState.text||'';
 els.fileName.textContent=AppState.sourceLabel;els.fileName.style.display=AppState.image?'':'none';projectStateToUI();drawHeightmapPreview();syncDesignSides();if(turnView)templateView(index?'back':'front');
 if(AppState.image){const built=sideRaster(slot,768);AppState.heightmap=built.hm;AppState.hmRows=built.rows;AppState.hmCols=built.cols;AppState.alphaMap=built.alphaMap;AppState.mask=built.mask;drawHeightmapPreview();}if(needsBuild)requestTemplatePreview();saveSettings();dirty();
}
function copyDesignToOtherSide(){
 if(!AppState.image||exportBusy)return;const other=1-activeDesignSide;if(designSides[other]?.image&&!confirm('Replace the '+(other?'back':'front')+' artwork with a copy of this design?'))return;
 const slot=captureDesignSide();designSides[other]={...slot,designAngle:((slot.designAngle+360)%360)-180,cache:null};syncDesignSides();requestTemplatePreview();dirty();toast('Copied to the '+(other?'back':'front')+' — each side can be edited separately','success');
}
function serializeDesignSides(){captureDesignSide();return designSides.map((slot,index)=>{slot=slot||emptyDesignSide(index);let image=null;if(slot.image){const c=document.createElement('canvas');c.width=slot.image.width;c.height=slot.image.height;c.getContext('2d').drawImage(slot.image,0,0);image=c.toDataURL('image/png')}return {image,source:(slot.sourceLabel||'Artwork').slice(0,300),settings:Object.fromEntries(SIDE_KEYS.filter(k=>!['text','customFontFamily'].includes(k)).map(k=>[k,slot[k]]))}});}
function restoreDesignSides(saved,images,index=0){
 designSides=saved?saved.map((data,i)=>({...emptyDesignSide(i),...data.settings,image:images[i],imageName:data.source,sourceLabel:data.source})): [null,null];activeDesignSide=saved?index:0;
 if(saved){const slot=designSides[index];for(const key of [...SIDE_KEYS,...SIDE_RUNTIME])AppState[key]=slot[key];AppState.text='';els.textInput.value='';els.fileName.textContent=slot.sourceLabel;els.fileName.style.display=slot.image?'':'none';}
 else captureDesignSide();syncDesignSides();
}
const sidesOriginalSync=syncTemplateUI;syncTemplateUI=function(){sidesOriginalSync();syncDesignSides();};
const sidesOriginalOptions=templateOptions;templateOptions=function(detail=768){return {...sidesOriginalOptions(),designs:sleeveDesignOptions(detail)};};
const sidesOriginalBlank=renderTemplateBlank;renderTemplateBlank=function(){if(hasSleeveArtwork())requestTemplatePreview();else sidesOriginalBlank();};
const sidesOriginalClear=$('clearDesign').onclick;$('clearDesign').onclick=()=>{sidesOriginalClear();captureDesignSide();syncDesignSides();};
$('centerDesign').onclick=()=>{AppState.designAngle=activeDesignSide?180:0;AppState.designY=44.5;AppState.designRotation=0;projectStateToUI();scheduleRebuild();saveSettings();dirty();};
$('editSide0').onclick=()=>switchDesignSide(0);$('editSide1').onclick=()=>switchDesignSide(1);$('copyDesignSide').onclick=copyDesignToOtherSide;
captureDesignSide();syncDesignSides();

$('linkDesignSettings').onchange=e=>{linkedSideSettings=e.target.checked;captureDesignSide();syncDesignSides();requestTemplatePreview();dirty();};
// Treat a stationary left click as selection; orbit drags and right-button pan
// keep their existing behavior. Hit testing uses the unmodified sleeve chart.
let logoPickStart=null;
function selectLogoAtPointer(e,reveal=true){
 if(!templateActive()||!templateRayMesh||!camera||exportBusy)return;
 const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
 const hit=ray.intersectObject(templateRayMesh,false)[0];if(!hit)return;
 const p=hit.point,n=hit.face.normal,radial=new THREE.Vector3(p.x,0,p.z).normalize();if(n.dot(radial)<.25||Math.abs(n.y)>.78)return;
 captureDesignSide();const chart=placementMesh?.userData.chart||SleeveTemplate.profile(templateBase),arc=SleeveTemplate.arcAt(chart,Math.atan2(p.z,p.x));let selected=-1;
 for(let i=0;i<2;i++){const slot=designSides[i];if(!slot?.image)continue;const map=sideRaster(slot,768),center=SleeveTemplate.arcAt(chart,(slot.designAngle||0)*Math.PI/180+Math.PI/2);let dx=center-arc;dx-=Math.round(dx/chart.perimeter)*chart.perimeter;const dy=p.y-slot.designY,r=slot.designRotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r),u=(dx*c+dy*s)/slot.designWidth+.5,v=.5-(-dx*s+dy*c)/slot.designHeight;
  if(u<0||u>=1||v<0||v>=1)continue;const x=Math.round(u*(map.cols-1)),y=Math.round(v*(map.rows-1));if(map.hm[y*map.cols+x]>.25)selected=i;
 }
 if(selected<0)return;switchDesignSide(selected,false);syncDesignSides();
 if(reveal)setSettingsOpen(true);
 if(reveal)$('designSidesPanel').scrollIntoView({block:'nearest',behavior:'smooth'});templateStatus('Editing '+(selected?'back':'front')+' artwork.');return true;
}
document.getElementById('threeContainer').addEventListener('pointerdown',e=>{logoPickStart=e.button===0&&!templateMove?{x:e.clientX,y:e.clientY,id:e.pointerId}:null;});
document.getElementById('threeContainer').addEventListener('pointerup',e=>{const start=logoPickStart;logoPickStart=null;if(start&&start.id===e.pointerId&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<5&&!templateMove)selectLogoAtPointer(e);});
document.getElementById('threeContainer').addEventListener('pointercancel',()=>logoPickStart=null);

function receiveSideUpload(img,label,index){
 if(index===activeDesignSide){setDesignImage(img,label);return;}
 const slot=designSides[index]||(designSides[index]=emptyDesignSide(index));slot.image=img;slot.imageName=slot.sourceLabel=label;slot.designHeight=Math.min(75,slot.designWidth*img.height/img.width);slot.text='';slot.heightmap=null;slot.cache=null;if(slot.bgEnable)autoDetectBgColor(img,slot);syncDesignSides();requestTemplatePreview();dirty();
}
