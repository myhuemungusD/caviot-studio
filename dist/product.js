'use strict';
document.getElementById('sampleBtn')?.addEventListener('click',()=>applyPattern(PATTERNS.find(p=>p.id==='hex')));
document.getElementById('emptyUpload')?.addEventListener('click',()=>els.fileInput.click());

const guide=document.createElement('dialog');
guide.className='product-dialog';guide.setAttribute('aria-labelledby','guideTitle');
guide.innerHTML=`<div class="guide-kicker">CAVIOT / MAKER GUIDE</div><div class="dialog-heading"><h2 id="guideTitle">Your first successful print.</h2><button class="btn btn-ghost" data-close>Close</button></div>
<h3>1. Start with the object</h3><p>The default Sleeve template is your ETSYFOLGER STL, including its original cavity, cutouts and bottom hole. Upload your artwork, choose Emboss or Deboss, and use Move design to drag it on the sleeve. The separate parametric presets still use elliptical cavities.</p>
<h3>2. Dial in the fit</h3><p>Measure the object with calipers. Enter its width and depth, then export a 5 mm fit ring. Print and test it before a full sleeve. Looseness adds to the total cavity width and depth, not to each side. Confirm that buttons, openings and moving parts remain accessible.</p>
<h3>3. Make your design</h3><p>Upload a PNG or JPG, paste an image, select a pattern, or type lettering. High-contrast artwork gives a clearer relief. Set the design size, raised or carved finish, and depth. Drag to orbit, right-drag to pan, and scroll or pinch to zoom.</p>
<h3>Front and back designs</h3><p>Click a logo on the sleeve to select its controls, or use the Front/Back editing buttons to choose an empty side. Hold the mouse wheel on a logo and drag to move it; release to return to orbiting. Rolling the wheel still zooms. Copy to the other side for matching artwork. Link settings keeps size, opposite placement and image processing matched; turn it off for separate adjustments. Artwork and text remain separate. Every selected design has its own depth, Emboss/Deboss, Even depth and Sharp edges settings. Use + Text to add lettering alongside images. Dropping another image asks whether to add it or replace the selected design. Up to 12 designs can share a sleeve. Use Undo or Ctrl+Z to undo an edit, and Redo or Ctrl+Shift+Z to restore it. Hide tools slides the panel into shortcut icons; click an icon to reopen its controls.</p><h3>Design Mainline bottom branding</h3><p>Open Design Mainline · bottom branding under the template selector. Enable your supplied logo, choose the underside or inside bottom, and use View bottom logo. Adjust its width and height, or hold the mouse wheel on it to drag. The default placement sits beside the existing bottom hole. The bottom mark has its own depth and Emboss/Deboss controls. Save project also saves the bottom placement.</p><h3>Even relief on the template</h3><p>Even depth uses the visible artwork silhouette. Turn it off for image-brightness relief. Placement follows distance around the sleeve; displacement follows local outward surface normals. Deboss leaves at least 0.8 mm of measured wall along those normals. Sharp edges builds distinct letter sidewalls and keeps the design 1.2 mm clear of rims and cutouts. Turn Sharp edges off for a tapered transition. Designs overlapping those zones taper or clip there. Keep the design clear of openings for a complete impression.</p><h3>4. Export and inspect</h3><p>STL and OBJ use millimeters. Exports are checked for open edges, non-manifold edges and zero-area faces. These checks do not prove printability or rule out self-intersections. Inspect the final mesh and layer preview in your slicer.</p><p><strong>Half sleeve</strong> creates one 180° shell, not a matched pair. <strong>Whole</strong> creates a 360° sleeve. <strong>Logo only</strong> retains a thin curved backing; it is not a freestanding cutout. Fit rings are always 360°.</p>
<h3>Make watertight</h3><p>Use Make watertight below the model to weld vertices within 0.00001 mm, remove duplicate and collapsed faces, and patch isolated missing triangular faces with edges up to 2 mm. It checks open edges, non-manifold edges and vertices, and winding conflicts. Larger holes, intersecting surfaces and winding conflicts need further repair; they are not automatically rebuilt. Your cavity and designed openings remain intact. After using the button, repair also runs on the full-resolution STL/OBJ export for this session. Settings changes require a fresh preview check. Inspect the export in your slicer.</p><h3>Keep your work</h3><p>Save project downloads an <code>.icaviot</code> file with every design, its settings, editable lettering and a PNG backup of its appearance. Open project restores both sides and their layers. Included fonts are restored automatically; additional custom fonts must be available in this browser to edit the lettering. Your settings are remembered on this browser, but artwork is not autosaved. Save before closing.</p>
<h3>Privacy &amp; personal edition</h3><p>Artwork and mesh processing stay on your device. This edition has no account, payment collection or analytics. Your 120 supplied font files are included in the font picker and load when selected. Additional uploaded fonts are stored in this browser until you remove them. Hosting providers may process normal access logs. Use artwork and fonts you have permission to use.</p><p>Caviot is an independent design tool. Device names identify presets and do not imply affiliation. Physical fit and manufacturing performance require testing.</p>
<p><a href="about.html">About Caviot Studio</a> · <a href="vendor/THREE-LICENSE.txt">Third-party license</a></p>`;
document.body.appendChild(guide);
guide.querySelector('[data-close]').onclick=()=>guide.close();
document.getElementById('guideBtn').onclick=()=>guide.showModal();
guide.addEventListener('click',e=>{if(e.target===guide){const r=guide.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)guide.close()}});

let projectDirty=false;
let projectRevision=0;
function dirty(){projectDirty=true;projectRevision++;document.title='• '+document.getElementById('projectName').value+' — Caviot Studio '+APP_BUILD}
function clean(){projectDirty=false;document.title=document.getElementById('projectName').value+' — Caviot Studio '+APP_BUILD}
document.querySelector('.shell').addEventListener('input',e=>{if(e.target.id!=='projectFile')dirty()});
document.querySelector('.shell').addEventListener('change',e=>{if(e.target.id!=='projectFile')dirty()});
const originalSetDesignImage=setDesignImage;
setDesignImage=function(img,label){originalSetDesignImage(img,label);dirty()};
window.addEventListener('beforeunload',e=>{if(projectDirty){e.preventDefault();e.returnValue=''}});
function safeFilename(){return (document.getElementById('projectName').value.trim()||'Untitled design').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80)||'icaviot-design'}
function saveProject(){
  try{
    let image=null;
    if(AppState.image){const c=document.createElement('canvas');c.width=AppState.image.width;c.height=AppState.image.height;c.getContext('2d').drawImage(AppState.image,0,0);image=c.toDataURL('image/png')}
    const p={format:'icaviot-project',version:1,name:document.getElementById('projectName').value.slice(0,80),source:(AppState.sourceLabel||'Artwork').slice(0,300),settings:collectSettings(),image};
    if(typeof serializeDesignSides==='function'){p.version=2;p.sides=serializeDesignSides();p.activeSide=activeDesignSide;p.linkSides=linkedSideSettings;p.image=null;}
    if(typeof serializeDesignLayers==='function'){p.version=3;p.layers=serializeDesignLayers();p.selectedIds=designSides.map(s=>s?.id||null);delete p.sides;}
    p.bottomBrand={...bottomBrand};
    const content=JSON.stringify(p);ProjectFormat.decode(content);
    downloadBlob(new Blob([content],{type:'application/json'}),safeFilename()+'.icaviot');clean();toast('Project download started — keep the file to reopen your design','success');
  }catch(error){toast('Could not save: '+error.message,'error')}
}
document.getElementById('saveProject').onclick=saveProject;
document.getElementById('openProject').onclick=()=>document.getElementById('projectFile').click();
document.getElementById('projectFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{
    if(file.size>36*1024*1024)throw Error('Project exceeds 36 MB.');
    const revision=projectRevision;
    const p=ProjectFormat.decode(await file.text());
    let img=null,sideImages=null,layerImages=null;
    if(p.image){img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>i.width*i.height<=MAX_IMAGE_PIXELS?resolve(i):reject(Error('Artwork exceeds 24 megapixels.'));i.onerror=()=>reject(Error('Project artwork is damaged.'));i.src=p.image})}
    if(p.version===2){sideImages=await Promise.all(p.sides.map(s=>!s.image?null:new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>i.width*i.height<=MAX_IMAGE_PIXELS?resolve(i):reject(Error('Artwork exceeds 24 megapixels.'));i.onerror=()=>reject(Error('Project artwork is damaged.'));i.src=s.image})));img=sideImages[p.activeSide];}
    if(p.version===3){layerImages=await Promise.all(p.layers.map(list=>Promise.all(list.map(s=>!s.image?null:new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>i.width*i.height<=MAX_IMAGE_PIXELS?resolve(i):reject(Error('Artwork exceeds 24 megapixels.'));i.onerror=()=>reject(Error('Project artwork is damaged.'));i.src=s.image})))));const selected=Math.max(0,p.layers[p.activeSide].findIndex(s=>s.id===p.selectedIds[p.activeSide]));img=layerImages[p.activeSide][selected]||null;}
    if(projectRevision!==revision)throw Error('The current design changed while opening. Please open the project again.');
    if(projectDirty&&!confirm('Replace this unsaved design? Cancel to save it first.'))return;
    clearTimeout(AppState.rebuildTimer);AppState.rebuildTimer=null;
    if (!Object.hasOwn(p.settings,'templateId')) p.settings.templateId='parametric';
    loadSettings(p.settings);AppState.text='';AppState.textRenderId++;els.textInput.value='';
    document.getElementById('projectName').value=p.name||'Untitled design';
    if(img){AppState.image=img;AppState.imageName=p.source;AppState.sourceLabel=p.source;els.fileName.textContent=p.source;els.fileName.style.display='';setEmptyState(false)}
    else{AppState.image=null;AppState.heightmap=null;AppState.lastValidation=null;AppState.sourceLabel='—';AppState.hmRows=0;AppState.hmCols=0;els.fileName.style.display='none';if(meshObj){scene.remove(meshObj);meshObj.geometry.dispose();disposeMaterial(meshObj.material);meshObj=null}setEmptyState(true);drawHeightmapPreview()}
    restoreBottomBrand(p.bottomBrand);
    if(p.version===3)restoreDesignLayers(p.layers,layerImages,p.activeSide,p.selectedIds);else restoreDesignSides(p.version===2?p.sides:null,sideImages,p.activeSide||0);linkedSideSettings=p.version>=2&&!!p.linkSides;$('linkDesignSettings').checked=linkedSideSettings;
    projectStateToUI();updateDevicePresetTip(AppState.preset);if(img)scheduleRebuild(true);else if(templateActive())renderTemplateBlank();updateStats();saveSettings();clean();if(typeof resetEditHistory==='function')resetEditHistory();toast('Project opened','success');
  }catch(error){toast('Could not open: '+error.message,'error')}
};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject()}});

let exportBusy=false;
function exportCurrent(format){
  if (templateActive()) { exportTemplate(format); return; }
  if(exportBusy)return;
  if(!AppState.image){toast('Add a design first','error');return}
  exportBusy=true;els.generateBtn.disabled=true;els.downloadObjBtn.disabled=true;els.generateBtn.textContent='Preparing…';
  const name=safeFilename(),mode=AppState.mode;
  const done=()=>{exportBusy=false;els.generateBtn.disabled=!AppState.image;els.downloadObjBtn.disabled=!AppState.image;els.generateBtn.textContent='Export STL'};
  // Yield so progress paints before rasterizing the source.
  setTimeout(()=>{
    let worker;
    try{
      const built=buildHeightmapAtDetail(MC.getExportDetail(AppState.detail));
      if(!built)throw Error('Add a valid image first.');
      const options=meshOptionsFromState(built.hm,built.rows,built.cols,built.mask);
      worker=new Worker('export-worker.js');
      const timer=setTimeout(()=>{worker.terminate();done();toast('Export took too long. Lower export detail and try again.','error')},60000);
      worker.onerror=()=>{clearTimeout(timer);worker.terminate();done();toast('Export could not run. Reload the page and try again.','error')};
      worker.onmessage=({data})=>{
        clearTimeout(timer);worker.terminate();done();
        if(data.error){toast(data.error,'error');return}
        downloadBlob(new Blob([format==='obj'?data.text:data.buffer],{type:format==='obj'?'model/obj':'model/stl'}),name+'_'+mode+'.'+format);
        toast(format.toUpperCase()+' exported — '+data.validation.triCount.toLocaleString()+' triangles. Inspect in your slicer.','success');
      };
      worker.postMessage({options,format,repair:repairOnExport});
    }catch(error){if(worker)worker.terminate();done();toast('Export failed: '+error.message,'error')}
  },30);
}

// Supply accessible names for legacy controls whose labels were visual divs.
document.querySelectorAll('.sidebar input:not([type=file]),.sidebar select').forEach(el=>{
  if(el.getAttribute('aria-label')||document.querySelector('label[for="'+el.id+'"]')||el.closest('label'))return;
  const field=el.closest('.field,.big-field');
  const label=field?.querySelector('.field-label,.big-field-label')?.textContent.trim();
  el.setAttribute('aria-label',label||({textInput:'Design text',imageScale:'Logo size',depthIn:'Relief depth',wrapInnerWidth:'Inner width in millimeters',wrapInnerDepth:'Inner depth in millimeters'})[el.id]||el.id);
});
