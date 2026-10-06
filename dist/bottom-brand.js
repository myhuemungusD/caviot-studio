'use strict';
// Bottom branding: one logo on the outside underside (or the inside floor), separate from the sleeve designs.
// The DM diamond is the standard mark and is on by default: 16 mm wide, raised 0.4 mm, centred on the deepest
// flat part of the underside so it stays clear of the rim fillet and the bottom hole. The earlier Design Mainline
// triangle stays available (and is what older saved projects with a bottom logo used).
const BOTTOM_LOGOS={
  dm:{label:'DM diamond',alt:'DM diamond logo',src:'branding/dm-diamond-relief.png',thumb:'branding/dm-diamond.png',thumbBg:'#141416',
    // dm-diamond-relief.png is 1024 x 1003 with a 4 px margin; the loader crops to the ink, so this is the ink aspect.
    aspect:1003/1024,width:16,
    places:{underside:{centerX:15.5,centerZ:1},inside:{centerX:10.5,centerZ:1}}},
  mainline:{label:'Design Mainline triangle',alt:'Design Mainline logo',src:'branding/design-mainline.png',thumb:'branding/design-mainline.png',thumbBg:'#fff',
    aspect:15.71/21,width:21,
    places:{underside:{centerX:14,centerZ:1,width:21,height:15.71},inside:{centerX:15.5,centerZ:7,width:13,height:9.725}}}
};
const BOTTOM_DEFAULT_LOGO='dm',BOTTOM_EDGE_MARGIN=2,BOTTOM_MIN_WIDTH=8;
const bottomDefaults={enabled:true,logo:'dm',surface:'underside',width:16,height:+(16*BOTTOM_LOGOS.dm.aspect).toFixed(2),centerX:15.5,centerZ:1,depthMm:.4,relief:'raised'};
let bottomBrand={...bottomDefaults},bottomMask=null,bottomDrag=null,bottomGhost=null,bottomGhostLogo=null,bottomSelected=false;
// bottomAuto: the placement still follows the template (nobody moved or resized it), so a template change refits it.
// bottomAutoOff: the default logo was switched off only because the current template has no room for it.
let bottomAuto=true,bottomAutoOff=false,bottomUserToggled=false,bottomRegionY={underside:0,inside:10};
const bottomMasks={},bottomMaskLoads={};
const bottomPanel=document.createElement('section');bottomPanel.className='panel';bottomPanel.id='bottomBrandPanel';
bottomPanel.innerHTML=`<details id="bottomBrandDetails"><summary>Bottom branding · DM logo</summary><div><img id="bottomBrandThumb" src="${BOTTOM_LOGOS.dm.thumb}" alt="${BOTTOM_LOGOS.dm.alt}" style="width:110px;height:90px;object-fit:contain;padding:6px;box-sizing:border-box;background:${BOTTOM_LOGOS.dm.thumbBg};border-radius:5px"><label class="check"><input id="bottomBrandEnabled" type="checkbox" disabled><span>Add bottom logo</span></label><label for="bottomBrandLogo">Logo</label><select id="bottomBrandLogo"><option value="dm">DM diamond (standard)</option><option value="mainline">Design Mainline triangle</option></select><label for="bottomBrandSurface">Print on</label><select id="bottomBrandSurface"><option value="underside">Underside of sleeve</option><option value="inside">Inside bottom</option></select><label for="bottomBrandWidth">Logo width (mm)</label><input id="bottomBrandWidth" type="number" min="4" max="60" step=".5"><label for="bottomBrandHeight">Logo height (mm)</label><input id="bottomBrandHeight" type="number" min="4" max="36" step=".5"><label for="bottomBrandX">Left / right (mm)</label><input id="bottomBrandX" type="number" min="-32" max="32" step=".25"><label for="bottomBrandZ">Front / back (mm)</label><input id="bottomBrandZ" type="number" min="-20" max="20" step=".25"><label for="bottomBrandDepth">Bottom depth (mm)</label><input id="bottomBrandDepth" type="number" min=".01" max="3" step=".01"><label for="bottomBrandRelief">Bottom finish</label><select id="bottomBrandRelief"><option value="raised">Emboss</option><option value="carved">Deboss</option></select><button class="btn btn-ghost" id="bottomBrandView" type="button">View bottom logo</button><button class="btn btn-ghost btn-sm" id="bottomBrandCenter" type="button">Fit logo to this surface</button><p class="muted-tip">On by default: the DM logo, 16 mm wide and raised 0.4 mm, centred on the flat underside clear of the rim and the bottom hole. <span class="desktop-only">Hold the mouse wheel on the logo and drag to move it.</span><span class="touch-only">Tap the logo, then drag it to move it.</span> It has its own depth and Emboss/Deboss setting; openings and edge margins are protected. A raised underside logo is what touches the bed when the sleeve prints upright: use a raft, or choose Deboss to keep the bottom flat on the bed.</p><p class="muted-tip" id="bottomBrandStatus" role="status">Loading the logo…</p></div></details>`;
document.querySelector('.template-select-panel').after(bottomPanel);
const bottomLogo=()=>BOTTOM_LOGOS[bottomBrand.logo]||BOTTOM_LOGOS[BOTTOM_DEFAULT_LOGO];
const bottomSurfaceName=()=>bottomBrand.surface==='inside'?'inside bottom':'underside';
function syncBottomBrand(){
  bottomPanel.hidden=!templateActive();const L=bottomLogo();
  $('bottomBrandEnabled').checked=bottomBrand.enabled;$('bottomBrandLogo').value=bottomBrand.logo;$('bottomBrandSurface').value=bottomBrand.surface;
  $('bottomBrandWidth').value=bottomBrand.width;$('bottomBrandHeight').value=bottomBrand.height;$('bottomBrandX').value=+bottomBrand.centerX.toFixed(2);$('bottomBrandZ').value=+bottomBrand.centerZ.toFixed(2);
  $('bottomBrandDepth').value=bottomBrand.depthMm;$('bottomBrandRelief').value=bottomBrand.relief;
  const thumb=$('bottomBrandThumb');if(thumb.getAttribute('src')!==L.thumb){thumb.src=L.thumb;thumb.alt=L.alt;thumb.style.background=L.thumbBg}
  $('bottomBrandView').textContent=bottomBrand.enabled?'View bottom logo':'Add & view bottom logo';
}
// Saved projects: a missing logo field means the logo predates the DM mark, so an enabled one keeps the triangle it
// was saved with. A project with no bottom branding at all predates the feature and stays without it.
function restoreBottomBrand(saved){
  if(saved===undefined)saved={enabled:false};
  bottomBrand={...bottomDefaults,...saved,logo:saved.logo||(saved.enabled?'mainline':BOTTOM_DEFAULT_LOGO)};
  bottomAuto=false;bottomAutoOff=false;bottomUserToggled=true;bottomSelected=false;
  bottomMask=bottomMasks[bottomBrand.logo]||null;if(!bottomMask)loadBottomLogo(bottomBrand.logo);
  syncBottomBrand();
}
// Where the logo starts. ETSYFOLGER uses measured placements; other templates are searched for the largest clear
// circle on the chosen surface and the logo is sized to fit inside it with an edge margin.
function bottomFitFor(surface,logoKey=bottomBrand.logo){
  const L=BOTTOM_LOGOS[logoKey]||BOTTOM_LOGOS[BOTTOM_DEFAULT_LOGO],builtin=!templateBase||templateBase===builtinTemplateBase;
  if(builtin){const p=L.places[surface];return{centerX:p.centerX,centerZ:p.centerZ,width:p.width||L.width,height:p.height||+((p.width||L.width)*L.aspect).toFixed(2),fits:true}}
  const region=bottomRegion(surface),spot=BottomFit.best(region);
  if(region)bottomRegionY[surface]=region.y;
  const mask=bottomMasks[logoKey],reach=mask?(mask.reach??=BottomFit.inkRadius(mask,L.aspect)):.5;
  const width=spot?Math.min(L.width,(spot.radius-BOTTOM_EDGE_MARGIN)/reach):0;
  const clamp=(v,m)=>Math.max(-m,Math.min(m,v));
  if(!spot||width<BOTTOM_MIN_WIDTH)return{centerX:spot?clamp(spot.x,32):0,centerZ:spot?clamp(spot.z,20):0,width:L.width,height:+(L.width*L.aspect).toFixed(2),fits:false};
  const w=Math.max(4,Math.floor(width*2)/2);
  return{centerX:+clamp(spot.x,32).toFixed(2),centerZ:+clamp(spot.z,20).toFixed(2),width:w,height:Math.max(4,+(w*L.aspect).toFixed(2)),fits:true};
}
let bottomRegionCache=null;
function bottomRegion(surface){
  const base=templateBase;if(!base)return null;
  if(bottomRegionCache?.base!==base)bottomRegionCache={base};
  if(!(surface in bottomRegionCache)){const positions=base.positions||Float32Array.from(base.points.flat());bottomRegionCache[surface]=BottomFit.region(positions,base.indices,surface)}
  return bottomRegionCache[surface];
}
function fitBottomBrand(){const f=bottomFitFor(bottomBrand.surface);Object.assign(bottomBrand,{centerX:f.centerX,centerZ:f.centerZ,width:f.width,height:f.height});return f.fits}
// A template change refits a logo nobody has placed by hand. If the default logo has no room on a custom
// template it is switched off (and comes back on the built-in template) rather than failing every export.
function bottomTemplateChanged(){
  if(!bottomAuto)return;const fits=fitBottomBrand();
  if(!fits&&bottomBrand.enabled&&!bottomUserToggled){bottomBrand.enabled=false;bottomAutoOff=true;$('bottomBrandStatus').textContent='This template has no flat '+bottomSurfaceName()+' area big enough for the logo, so it is off. You can still add it and place it yourself.';}
  else if(fits&&bottomAutoOff){bottomBrand.enabled=true;bottomAutoOff=false;}
  syncBottomBrand();
}
const bottomOriginalSetBase=setActiveTemplateBase;setActiveTemplateBase=function(base){bottomOriginalSetBase(base);bottomTemplateChanged();};
function bottomChanged(){syncBottomBrand();if(bottomBrand.enabled)$('bottomBrandStatus').textContent='Forming the logo on the '+bottomSurfaceName()+'…';requestTemplatePreview();dirty();}
const bottomPlacedByHand=()=>{bottomAuto=false;bottomAutoOff=false;};
$('bottomBrandEnabled').onchange=e=>{bottomBrand.enabled=e.target.checked;bottomUserToggled=true;bottomAutoOff=false;bottomChanged();if(bottomBrand.enabled)viewBottomBrand();else{bottomSelected=false;$('bottomBrandStatus').textContent='Bottom logo is off. Choose Add & view bottom logo to place it.';}};
$('bottomBrandLogo').onchange=e=>{
  const key=BOTTOM_LOGOS[e.target.value]?e.target.value:BOTTOM_DEFAULT_LOGO;if(key===bottomBrand.logo)return;bottomBrand.logo=key;
  // Keep a hand placement and width; only the height follows the new logo's proportions.
  if(bottomAuto)fitBottomBrand();else bottomBrand.height=Math.max(4,Math.min(36,+(bottomBrand.width*BOTTOM_LOGOS[key].aspect).toFixed(2)));
  bottomMask=bottomMasks[key]||null;hideBottomGhost();if(!bottomMask)loadBottomLogo(key);bottomChanged();
};
$('bottomBrandSurface').onchange=e=>{bottomBrand.surface=e.target.value;bottomAuto=true;fitBottomBrand();bottomChanged();viewBottomBrand();};
for(const [id,key,min,max]of [['bottomBrandWidth','width',4,60],['bottomBrandHeight','height',4,36],['bottomBrandX','centerX',-32,32],['bottomBrandZ','centerZ',-20,20]])$(id).onchange=e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)){bottomBrand[key]=Math.max(min,Math.min(max,n));bottomPlacedByHand();}bottomChanged();};
$('bottomBrandDepth').onchange=e=>{bottomBrand.depthMm=Math.max(.01,Math.min(3,Number(e.target.value)||.4));bottomChanged();};
$('bottomBrandRelief').onchange=e=>{bottomBrand.relief=e.target.value;bottomChanged();};
$('bottomBrandCenter').onclick=()=>{bottomAuto=true;const fits=fitBottomBrand();bottomChanged();if(!fits)$('bottomBrandStatus').textContent='No flat area on this '+bottomSurfaceName()+' is big enough; the logo was centred at its standard size. Check it in the preview.';};
function viewBottomBrand(){if(!camera||!controls||!templateBase)return;setTemplateMove(false);if(gridHelper)gridHelper.visible=false;const inside=bottomBrand.surface==='inside';camera.up.set(0,0,1);controls.target.set(0,inside?10:0,0);camera.position.set(0,inside?170:-120,0);camera.lookAt(controls.target);controls.update();}
$('bottomBrandView').onclick=()=>{if(!bottomMask){$('bottomBrandStatus').textContent='The logo is still loading. Try again in a moment.';return;}if(!bottomBrand.enabled){bottomBrand.enabled=true;bottomUserToggled=true;bottomAutoOff=false;bottomChanged();}viewBottomBrand();};
const bottomOriginalView=templateView;templateView=function(which){if(camera)camera.up.set(0,1,0);if(gridHelper)gridHelper.visible=true;bottomOriginalView(which);};
const bottomOriginalOptions=templateOptions;templateOptions=function(detail=768){const o=bottomOriginalOptions(detail);if(bottomBrand.enabled){if(!bottomMask)throw Error('The bottom logo is still loading. Try again in a moment.');o.designs.push({surface:bottomBrand.surface,maxHeight:bottomBrand.depthMm,negative:bottomBrand.relief==='carved',sharp:true,centerX:bottomBrand.centerX,centerZ:bottomBrand.centerZ,designWidth:bottomBrand.width,designHeight:bottomBrand.height,designRotation:0,designY:0,heightmap:bottomMask.hm,rows:bottomMask.rows,cols:bottomMask.cols});o.sharp=true;}return o;};
const bottomOriginalHas=hasSleeveArtwork;hasSleeveArtwork=function(){return bottomOriginalHas()||bottomBrand.enabled;};
const bottomOriginalSync=syncTemplateUI;syncTemplateUI=function(){bottomOriginalSync();syncBottomBrand()};
const bottomOriginalReplace=replaceTemplateMesh;replaceTemplateMesh=function(...args){hideBottomGhost();bottomOriginalReplace(...args);};
function hideBottomGhost(){if(bottomGhost)bottomGhost.visible=false;}
function showBottomGhost(){if(!scene||!bottomMask)return;if(bottomGhost&&bottomGhostLogo!==bottomMask){scene.remove(bottomGhost);bottomGhost.geometry.dispose();bottomGhost.material.map?.dispose();bottomGhost.material.dispose();bottomGhost=null}if(!bottomGhost){const canvas=document.createElement('canvas');canvas.width=bottomMask.cols;canvas.height=bottomMask.rows;const ctx=canvas.getContext('2d'),data=ctx.createImageData(canvas.width,canvas.height);for(let i=0;i<bottomMask.hm.length;i++){data.data[i*4]=255;data.data[i*4+1]=115;data.data[i*4+2]=0;data.data[i*4+3]=Math.round(bottomMask.hm[i]*255);}ctx.putImageData(data,0,0);bottomGhost=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthTest:false,side:THREE.DoubleSide}));bottomGhost.renderOrder=100;bottomGhostLogo=bottomMask;scene.add(bottomGhost);}const inside=bottomBrand.surface==='inside',y=bottomRegionY[bottomBrand.surface]??(inside?10:0);bottomGhost.rotation.set(inside?-Math.PI/2:Math.PI/2,0,inside?Math.PI:0);bottomGhost.scale.set(bottomBrand.width,bottomBrand.height,1);bottomGhost.position.set(bottomBrand.centerX,inside?y+.15:y-.15,bottomBrand.centerZ);bottomGhost.visible=true;}
function bottomPointerHit(e){if(!templateActive()||!bottomBrand.enabled||!bottomMask||!templateRayMesh||exportBusy)return null;const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObject(templateRayMesh,false)[0];if(!hit||hit.point.y>12||(bottomBrand.surface==='inside'?hit.face.normal.y<.95:hit.face.normal.y>-.95))return null;return hit.point;}
function bottomArtworkAt(p){const u=(bottomBrand.surface==='inside'?-1:1)*(p.x-bottomBrand.centerX)/bottomBrand.width+.5,v=.5-(p.z-bottomBrand.centerZ)/bottomBrand.height;if(u<0||u>1||v<0||v>1)return false;return bottomMask.hm[Math.round(v*(bottomMask.rows-1))*bottomMask.cols+Math.round(u*(bottomMask.cols-1))]>.25;}
// Capture on the parent before OrbitControls sees the press: a middle-button drag on the logo, or on touch screens a
// drag that starts on the logo after it was tapped (a drag anywhere else still orbits).
const bottomContainer=$('threeContainer');
bottomContainer.addEventListener('pointerdown',e=>{
  if(bottomDrag){if(bottomDrag.touch&&e.pointerId!==bottomDrag.id){e.preventDefault();e.stopImmediatePropagation();finishBottomDrag({pointerId:bottomDrag.id});}return;}
  const touch=e.pointerType!=='mouse'&&e.isPrimary&&e.button===0&&bottomSelected&&!templateMove;
  if(e.button!==1&&!touch)return;const p=bottomPointerHit(e);if(!p||!bottomArtworkAt(p))return;
  e.preventDefault();e.stopImmediatePropagation();
  bottomDrag={id:e.pointerId,touch,moved:!touch,sx:e.clientX,sy:e.clientY,x:p.x-bottomBrand.centerX,z:p.z-bottomBrand.centerZ,enabled:controls.enabled};controls.enabled=false;bottomContainer.setPointerCapture(e.pointerId);showBottomGhost();
  templateStatus(touch?'Moving bottom logo · lift your finger to place it.':'Moving bottom logo · release the scroll wheel to place it.');
},true);
bottomContainer.addEventListener('pointermove',e=>{if(!bottomDrag||bottomDrag.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();if(!bottomDrag.moved&&Math.hypot(e.clientX-bottomDrag.sx,e.clientY-bottomDrag.sy)<6)return;bottomDrag.moved=true;const p=bottomPointerHit(e);if(!p)return;bottomBrand.centerX=Math.max(-32,Math.min(32,p.x-bottomDrag.x));bottomBrand.centerZ=Math.max(-20,Math.min(20,p.z-bottomDrag.z));showBottomGhost();},true);
function finishBottomDrag(e){if(!bottomDrag||e.pointerId!==bottomDrag.id)return;e.preventDefault?.();e.stopImmediatePropagation?.();const moved=bottomDrag.moved;controls.enabled=bottomDrag.enabled;bottomDrag=null;if(bottomContainer.hasPointerCapture(e.pointerId))bottomContainer.releasePointerCapture(e.pointerId);if(moved){bottomPlacedByHand();bottomChanged();}else{hideBottomGhost();templateStatus('Bottom logo selected · drag it to move it, or drag elsewhere to orbit.');}}
for(const type of ['pointerup','pointercancel','lostpointercapture'])bottomContainer.addEventListener(type,finishBottomDrag,true);
window.addEventListener('blur',()=>{if(bottomDrag)finishBottomDrag({pointerId:bottomDrag.id});});
const bottomOriginalPick=selectLogoAtPointer;selectLogoAtPointer=function(e,reveal=true){const p=bottomPointerHit(e);if(p&&bottomArtworkAt(p)){bottomSelected=true;if(reveal&&(reveal==='force'||!(typeof CaviotDevice!=='undefined'&&CaviotDevice.phoneLayout()))){setSettingsOpen(true);$('bottomBrandDetails').open=true;bottomPanel.scrollIntoView({block:'nearest'});}templateStatus(e.pointerType&&e.pointerType!=='mouse'?'Bottom logo selected · drag it to move it.':'Editing the bottom logo.');return true;}bottomSelected=false;return bottomOriginalPick(e,reveal);};
// Masks follow the loader rules the relief tests use: ink is anything darker than 180 on all channels, cropped to
// the ink plus 4 px and resampled to 1024 columns; 230 and lighter is background, 150 and darker full height.
function loadBottomLogo(key=bottomBrand.logo){
  const L=BOTTOM_LOGOS[key];if(!L)return Promise.resolve(null);
  return bottomMaskLoads[key]??=(async()=>{
    try{
      const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Could not load the '+L.label+' logo.'));i.src=L.src;});
      const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let x0=img.width,y0=img.height,x1=0,y1=0;
      for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){const i=(y*img.width+x)*4;if(Math.min(data[i],data[i+1],data[i+2])<180){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
      x0=Math.max(0,x0-4);y0=Math.max(0,y0-4);x1=Math.min(img.width-1,x1+4);y1=Math.min(img.height-1,y1+4);
      const cols=1024,rows=Math.round(cols*(y1-y0+1)/(x1-x0+1));canvas.width=cols;canvas.height=rows;ctx.imageSmoothingQuality='high';ctx.drawImage(img,x0,y0,x1-x0+1,y1-y0+1,0,0,cols,rows);
      const pixels=ctx.getImageData(0,0,cols,rows).data,hm=new Float32Array(cols*rows);for(let i=0;i<hm.length;i++)hm[i]=Math.max(0,Math.min(1,(230-Math.min(pixels[i*4],pixels[i*4+1],pixels[i*4+2]))/80));
      const mask={hm,cols,rows,logo:key};bottomMasks[key]=mask;
      if(bottomBrand.logo===key){bottomMask=mask;$('bottomBrandEnabled').disabled=false;
        // A custom template fitted before the mask arrived used a round estimate of the logo's reach; refine it.
        if(bottomAuto&&templateBase&&templateBase!==builtinTemplateBase)bottomTemplateChanged();
        $('bottomBrandStatus').textContent=bottomBrand.enabled?'The '+L.label+' logo is ready.':'The '+L.label+' logo is ready. Tick Add bottom logo to use it.';if(bottomBrand.enabled)requestTemplatePreview();}
      return mask;
    }catch(error){delete bottomMaskLoads[key];if(bottomBrand.logo===key)$('bottomBrandStatus').textContent=error.message;return null;}
  })();
}
syncBottomBrand();loadBottomLogo();

const bottomOriginalRequest=requestTemplatePreview;requestTemplatePreview=function(){if(bottomBrand.enabled&&!bottomMask){templateStatus('Loading the bottom logo…');return;}bottomOriginalRequest();};

function reportBottomPreview(data){if(!bottomBrand.enabled)return;const count=data.info?.affectedByDesign?.at(-1);$('bottomBrandStatus').textContent=data.error?'Bottom preview could not finish: '+data.error:count===0?'The logo is outside the usable bottom area. Click Fit logo to this surface.':count>0?bottomLogo().label+' logo formed on the '+bottomSurfaceName()+' at '+bottomBrand.depthMm.toFixed(2)+' mm'+(bottomBrand.relief==='carved'?' deep.':' high.'):'Checking bottom placement…';}
