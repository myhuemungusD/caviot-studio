'use strict';
/* Upload any STL as the sleeve template. Heavy work (parse, weld, orientation,
   surface preparation) runs in template-worker.js; this file wires the UI. */
let customTemplate=null,customPrepWorker=null,customPrepCancel=null,customPrepSeq=0,customLoading=false;
// True while an upload or project template that should switch to the template is running; choosing another template clears it.
let customActivatePending=false;
const CUSTOM_EMBED_LIMIT=24*1024*1024;
const customDefaults={up:'auto',turn:0,units:'mm',autoAlign:true};

// ---------- Panel ----------
const customPanel=document.createElement('div');customPanel.id='customTemplateTools';customPanel.className='custom-template-tools';
customPanel.innerHTML=`<div class="custom-template-actions"><button class="btn btn-ghost btn-sm" id="uploadTemplateBtn" type="button">Upload STL template…</button><button class="btn btn-ghost btn-sm" id="flattenStlBtn" type="button" title="Old behaviour: turn an STL's top view into a height-map image">Flatten STL into artwork</button></div>
<input type="file" id="templateStlInput" accept=".stl,model/stl,application/sla,application/vnd.ms-pki.stl" hidden>
<div id="customTemplatePanel" hidden>
 <p class="custom-template-name" id="customTemplateInfo"></p>
 <p class="muted-tip" id="customTemplateStatus" role="status"></p>
 <div class="custom-orient-grid">
  <label for="customUp">Up axis</label><select id="customUp"><option value="auto">Auto (longest side up)</option><option value="+z">+Z up</option><option value="-z">−Z up (flip)</option><option value="+y">+Y up</option><option value="-y">−Y up (flip)</option><option value="+x">+X up</option><option value="-x">−X up (flip)</option></select>
  <label for="customTurn">Turn</label><select id="customTurn"><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select>
  <label for="customUnits">File units</label><select id="customUnits"><option value="mm">millimetres</option><option value="cm">centimetres</option><option value="in">inches</option><option value="m">metres</option></select>
 </div>
 <label class="check"><input type="checkbox" id="customAutoAlign" checked><span>Face the widest side to the front</span></label>
 <label class="check" id="customRaiseRow" hidden title="This template's surface is covered in bumps or ridges. Draped over them, embossed artwork would break into pieces; raised, it sits on a smooth pad just above the texture."><input type="checkbox" id="customRaise" checked><span>Raise embossed designs above the surface texture</span></label>
 <div class="custom-template-actions"><button class="btn btn-ghost btn-sm" id="repairTemplateBtn" type="button">Make template watertight</button><button class="btn btn-ghost btn-sm" id="removeTemplateBtn" type="button">Remove template</button></div>
</div>`;
$('templateDescription').after(customPanel);
const customStyle=document.createElement('style');customStyle.textContent=`.custom-template-tools{margin-top:8px}.custom-template-actions{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.custom-orient-grid{display:grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:center;margin:8px 0}.custom-orient-grid label{font-size:12px}.custom-template-name{font-weight:600;margin:8px 0 2px;overflow-wrap:anywhere}#customTemplateStatus.error{color:var(--warning,#f5a524)}#customTemplateStatus.bad{color:var(--danger,#ff5d5d)}`;document.head.appendChild(customStyle);
const customInput=$('templateStlInput');
function openTemplateUpload(){customInput.value='';customInput.click()}
$('uploadTemplateBtn').onclick=openTemplateUpload;
$('flattenStlBtn').onclick=()=>els.stlInput&&els.stlInput.click();
// Errors are already shown in the panel and a toast by useCustomTemplateBuffer.
customInput.onchange=()=>{const file=customInput.files?.[0];if(file)loadCustomTemplateFile(file).catch(()=>{})};
const isCancelled=error=>error?.code==='CANCELLED';
function customStatus(message,level=''){const el=$('customTemplateStatus');el.textContent=message;el.classList.toggle('error',level==='warn');el.classList.toggle('bad',level==='bad')}
function customOrientationFromUI(){return CustomTemplate.normalizeOrientation({up:$('customUp').value,turn:Number($('customTurn').value),units:$('customUnits').value,autoAlign:$('customAutoAlign').checked,raiseOnTexture:$('customRaise').checked})}
function customOrientationToUI(o){$('customUp').value=o.up;$('customTurn').value=String(o.turn);$('customUnits').value=o.units;$('customAutoAlign').checked=o.autoAlign;$('customRaise').checked=o.raiseOnTexture}
function syncCustomPanel(){
  const option=$('templateChoice').querySelector('option[value="custom-stl"]');const name=customTemplate?.name;option.textContent=name?'Custom STL · '+name.slice(0,40):'Custom STL · upload…';
  $('customTemplatePanel').hidden=!customTemplate;$('customRaiseRow').hidden=!customTemplate?.preview?.texture?.textured;
  for(const id of ['customUp','customTurn','customUnits','customAutoAlign','customRaise','repairTemplateBtn','removeTemplateBtn','uploadTemplateBtn'])$(id).disabled=customLoading&&id!=='removeTemplateBtn'||exportBusy;
  if(customTemplate){const b=customTemplate.base.bounds,dims=[b.max[0]-b.min[0],b.max[2]-b.min[2],b.max[1]-b.min[1]].map(v=>v.toFixed(1)).join(' × ');$('customTemplateInfo').textContent=customTemplate.name+' · '+dims+' mm · '+customTemplate.report.triangles.toLocaleString()+' triangles';}
}

// ---------- Worker orchestration ----------
// Only one preparation runs at a time; starting another (or removing the template) cancels
// the previous one, whose promise rejects with code CANCELLED so callers can ignore it.
function cancelCustomPreparation(){if(customPrepCancel)customPrepCancel()}
function prepareCustomTemplate(job){
  cancelCustomPreparation();
  const id=++customPrepSeq,worker=new Worker('template-worker.js');customPrepWorker=worker;customLoading=true;syncCustomPanel();
  return new Promise((resolve,reject)=>{
    let ready=null;
    const end=()=>{worker.terminate();if(customPrepWorker===worker){customPrepWorker=null;customPrepCancel=null;customLoading=false}syncCustomPanel()};
    customPrepCancel=()=>{end();const error=Error('Template preparation was cancelled.');error.code='CANCELLED';reject(error)};
    worker.onerror=e=>{e.preventDefault?.();end();reject(Error('The template worker stopped'+(e.message?': '+e.message:'')+'. The mesh may be too large for this browser; try a simplified STL.'))};
    worker.onmessage=({data})=>{
      if(data.id!==id)return;
      if(data.progress){if(!ready){templateStatus('Loading template: '+data.progress+'…');customStatus('Loading: '+data.progress+'…')}return}
      if(data.error){end();reject(Error(data.error));return}
      if(data.stage==='ready'){
        const source=data.source||job.source,t={key:'custom-'+Date.now()+'-'+id,name:job.name,source,report:data.report,orientation:data.base.orientation,base:data.base,display:data.display,preview:data.preview,print:null,repaired:!!(job.repaired||job.repair||data.report.repaired),embed:null};
        ready=t;end();resolve(t);
      }
    };
    const message={type:'custom-prepare',id,orientation:job.orientation||customDefaults,repair:!!job.repair,skipPrint:true};
    // Phones keep a smaller preview copy (CaviotDevice.device.displayTriangles); desktop leaves the 300k default.
    const displayTriangles=typeof CaviotDevice!=="undefined"?CaviotDevice.device?.displayTriangles:undefined;if(displayTriangles&&displayTriangles!==CustomTemplate.DISPLAY_TRIANGLES)message.displayTriangles=displayTriangles;
    if(job.buffer){message.buffer=job.buffer;worker.postMessage(message,[job.buffer])}else{message.source=job.source;message.report=job.report;worker.postMessage(message)}
  });
}
// The full-resolution print surface is prepared in the background once a custom template is in use.
function ensureCustomPrint(t=customTemplate){
  if(!t||t.print||t.printWorker)return;const worker=new Worker('template-worker.js');t.printWorker=worker;
  const done=()=>{worker.terminate();t.printWorker=null};
  worker.onmessage=({data})=>{if(data.progress)return;done();if(data.error){if(customTemplate===t)customStatus('Print surface could not be prepared in advance: '+data.error+' Export will try again.','warn');return}t.print=data.print;if(customTemplate===t){const s=customSummary(t);customStatus(s.text,s.level)}};
  worker.onerror=e=>{e.preventDefault?.();done();if(customTemplate===t)customStatus('Print surface could not be prepared in advance; export will prepare it.','warn')};
  worker.postMessage({type:'custom-print',id:1,base:t.base});
  if(customTemplate===t){const s=customSummary(t);customStatus(s.text,s.level)}
}
function dropCustomPrint(t){if(t?.printWorker){t.printWorker.terminate();t.printWorker=null}}
function customSummary(t){
  const r=t.report,notes=[],issues=CustomTemplate.describeProblems(r);let level='';
  const b=t.base.bounds,ext=[b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]],largest=Math.max(...ext);
  if(issues.length){level='bad';notes.push('Not watertight: '+issues.join(', ')+'. Preview works, but export needs a closed mesh. Try Make template watertight (closes tiny holes only) or repair the file in your mesh tool.')}
  if(r.inverted)notes.push('Normals were inside-out and have been flipped.');else if(r.flippedFaces)notes.push(r.flippedFaces.toLocaleString()+' inconsistently wound faces were re-oriented.');
  if(r.nonOrientable){level='bad';notes.push('Some faces cannot be oriented consistently (non-orientable surface).')}
  if(r.degenerate||r.duplicate)notes.push('Removed '+(r.degenerate+r.duplicate).toLocaleString()+' degenerate or duplicate faces.');
  if(r.components>1)notes.push(r.components+' separate shells.');
  if(largest<5){level=level||'warn';notes.push('The model is only '+largest.toFixed(2)+' mm across. Was it exported in cm, inches or metres? Change File units.')}
  if(largest>400){level=level||'warn';notes.push('The model is '+Math.round(largest)+' mm across. If that is wrong, change File units.')}
  const s=t.preview.stats;if(!s.outerVertices){level='bad';notes.push('No outward-facing side walls were found for artwork. Try another Up axis.')}
  else if(s.thinVertices/s.outerVertices>.5){level=level||'warn';notes.push('Most outside walls are thinner than 1.6 mm, so relief is suppressed there.')}
  if(t.display)notes.push('Large mesh: preview uses a simplified '+(t.display.indices.length/3).toLocaleString()+'-triangle copy; export uses all '+r.triangles.toLocaleString()+' triangles.');
  else if(r.triangles>250000)notes.push('Large mesh: previews and exports may be slow.');
  notes.push(t.print?'Print surface ready ('+(Number.isFinite(t.print.spacing)?t.print.spacing.toFixed(2)+' mm spacing':'original triangles, already dense')+').':t.printWorker?'Preparing the print surface in the background…':'The print surface is prepared when you use this template.');
  if(!issues.length&&!r.nonOrientable)notes.unshift('Closed, manifold mesh.');
  if(r.repairReport){const x=r.repairReport;notes.unshift('Make template watertight: welded '+x.welded+' vertices, removed '+x.removed+' faces, patched '+x.filled+' tiny holes'+(issues.length?'; larger holes remain.':'.'))}
  return{text:notes.join(' '),level};
}
async function loadCustomTemplateFile(file){
  if(exportBusy){toast('Wait for the export to finish.','error');return}
  if(file.size>CustomTemplate.MAX_BYTES){const message='Could not use '+file.name+': the STL is larger than 100 MB. Simplify it in your mesh tool first.';toast(message,'error');$('customTemplatePanel').hidden=!customTemplate;customStatus(message,'bad');return}
  const buffer=await file.arrayBuffer();return useCustomTemplateBuffer(buffer,file.name.replace(/\.stl$/i,'').slice(0,120)||'Custom STL',customDefaults,{activate:true});
}
async function useCustomTemplateBuffer(buffer,name,orientation,{activate=true,repaired=false,quiet=false}={}){
  $('customTemplatePanel').hidden=false;$('customTemplateInfo').textContent=name;customStatus('Reading '+name+'…');templateStatus('Loading template '+name+'…');
  try{
    if(activate)customActivatePending=true;
    const t=await prepareCustomTemplate({buffer,name,orientation,repaired});
    installCustomTemplate(t,activate&&customActivatePending);customActivatePending=false;if(!quiet)toast('Template ready: '+name,'success');return t;
  }catch(error){
    if(isCancelled(error))throw error; // the newer preparation owns customActivatePending
    customActivatePending=false;const message='Could not use this STL: '+error.message;customStatus(message,'bad');templateStatus(message,true);if(!quiet)toast(message,'error');
    if(!customTemplate)$('customTemplatePanel').hidden=true;else syncCustomPanel();
    throw error;
  }
}
function installCustomTemplate(t,activate){
  if(customTemplate&&customTemplate!==t)dropCustomPrint(customTemplate);customTemplate=t;customOrientationToUI(CustomTemplate.normalizeOrientation(t.orientation));syncCustomPanel();const summary=customSummary(t);customStatus(summary.text,summary.level);
  t.embedPromise=encodeCustomTemplate(t).then(embed=>{t.embed=embed;return embed}).catch(()=>null);
  if(activate)activateCustomTemplate();
}
function activateCustomTemplate(){
  if(!customTemplate)return;AppState.templateId='custom-stl';AppState.mode='sleeve';
  const base=customTemplate.display||customTemplate.base;setActiveTemplateBase(base);ensureCustomPrint();{const s=customSummary(customTemplate);customStatus(s.text,s.level)}
  const h=base.height;const fit=s=>{if(s&&(s.designY>h||s.designY<0))s.designY=Math.round(h/2*10)/10};fit(AppState);if(typeof designLayers!=='undefined')designLayers.flat().forEach(fit);
  projectStateToUI();if(AppState.image)scheduleRebuild(true);else renderTemplateBlank();templateView('front');syncTemplateUI();saveSettings();
}
function activateBuiltinTemplate(){if(builtinTemplateBase&&templateBase!==builtinTemplateBase)setActiveTemplateBase(builtinTemplateBase)}
// Called by the template selector before it switches.
function beforeTemplateChoice(value){
  if(value!=='custom-stl')customActivatePending=false; // a template still loading must not take over
  if(value==='custom-stl'){
    // Keyboard users change selects with arrow keys, so never pop a file dialog from here.
    if(!customTemplate){$('customTemplatePanel').hidden=true;templateStatus('Upload an STL first with Upload STL template.',true);$('uploadTemplateBtn').focus();return false}setActiveTemplateBase(customTemplate.display||customTemplate.base);ensureCustomPrint();setTimeout(()=>templateView('front'));return true}
  if(value==='etsyfolger-v1'){if(!builtinTemplateBase){toast(builtinTemplateError?builtinTemplateError.message:'The ETSYFOLGER template is still loading.','error');return false}activateBuiltinTemplate();setTimeout(()=>templateView('front'));}
  return true;
}
templateJobData=function(worker,quality){
  if(AppState.templateId!=='custom-stl'||!customTemplate)return undefined;const key=customTemplate.key;
  const raiseOnTexture=CustomTemplate.normalizeOrientation(customTemplate.orientation).raiseOnTexture;
  if(quality==='preview'){if(worker.customTemplateKey===key)return{kind:'custom',key,raiseOnTexture};worker.customTemplateKey=key;return{kind:'custom',key,raiseOnTexture,prepared:customTemplate.preview}}
  return customTemplate.print?{kind:'custom',key,raiseOnTexture,prepared:customTemplate.print}:{kind:'custom',key,raiseOnTexture,base:customTemplate.base};
};
const customOriginalInfo=templateInfo;templateInfo=function(){
  if(AppState.templateId!=='custom-stl'||!customTemplate)return customOriginalInfo();
  const h=customTemplate.base.height;
  return{label:customTemplate.name,file:customTemplate.name.replace(/[^\p{L}\p{N}_-]/gu,'').slice(0,40)||'custom',description:'Your uploaded STL. Its geometry is kept; artwork follows the outer surface.',surface:customTemplate.name.slice(0,30)+' · custom template',stats:'Custom STL · '+h.toFixed(1)+' mm tall',kept:'Template geometry kept',ready:'Your template is ready. Add an image, pattern or text.',exportHint:customTemplate.report.closed?'':'Your template itself is not watertight: use Make template watertight in the Sleeve template panel, or repair the STL in your mesh tool.'};
};
// Placement helpers read the chart from the template when it has one (custom templates carry theirs).
const customOriginalProfile=SleeveTemplate.profile;SleeveTemplate.profile=base=>base&&base.chart?base.chart:customOriginalProfile(base);
// Bottom logo placement on custom templates is fitted by bottom-brand.js (BottomFit) whenever the template changes.
const customOriginalSync=syncTemplateUI;syncTemplateUI=function(){customOriginalSync();syncCustomPanel()};

// ---------- Orientation, repair, removal ----------
function reorientCustomTemplate(repair=false){
  if(!customTemplate)return;const previous=customTemplate,orientation=customOrientationFromUI();customStatus(repair?'Repairing…':'Re-orienting…');
  prepareCustomTemplate({source:previous.source,report:previous.report,name:previous.name,orientation,repair,repaired:previous.repaired||repair}).then(t=>{
    installCustomTemplate(t,AppState.templateId==='custom-stl');
    if(repair){toast(t.report.closed?'Template is now watertight':'Template still has problems — see the template panel',t.report.closed?'success':'error');}
    dirty();
  }).catch(error=>{if(isCancelled(error))return;customStatus((repair?'Repair failed: ':'Could not re-orient: ')+error.message,'bad');customOrientationToUI(CustomTemplate.normalizeOrientation(previous.orientation))});
}
for(const id of ['customUp','customTurn','customUnits','customAutoAlign'])$(id).addEventListener('change',e=>{e.stopPropagation();reorientCustomTemplate(false)});
// Raising is a build option, not a geometry change: keep the prepared surfaces and just rebuild the relief.
$('customRaise').addEventListener('change',e=>{e.stopPropagation();if(!customTemplate)return;const t=customTemplate;t.orientation={...t.orientation,raiseOnTexture:e.target.checked};if(AppState.templateId==='custom-stl'){if(AppState.image)scheduleRebuild(true);else renderTemplateBlank()}dirty()});
$('repairTemplateBtn').onclick=()=>reorientCustomTemplate(true);
$('removeTemplateBtn').onclick=()=>{cancelCustomPreparation();const wasActive=AppState.templateId==='custom-stl';dropCustomPrint(customTemplate);customTemplate=null;syncCustomPanel();if(wasActive){AppState.templateId='etsyfolger-v1';activateBuiltinTemplate();projectStateToUI();if(templateBase){if(AppState.image)scheduleRebuild(true);else renderTemplateBlank();templateView('front')}saveSettings()}toast('Custom template removed','success');dirty()};

// ---------- Persistence: project files ----------
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob)})}
async function gzipBytes(buffer){const stream=new Blob([buffer]).stream().pipeThrough(new CompressionStream('gzip'));return new Uint8Array(await new Response(stream).arrayBuffer())}
// Decompress with the same 100 MB cap as uploads, so a damaged or hostile project cannot exhaust memory.
async function gunzipBytes(bytes,limit=CustomTemplate.MAX_BYTES){
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let total=0;
  for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){reader.cancel().catch(()=>{});throw Error('The embedded template is larger than 100 MB.')}chunks.push(value)}
  const out=new Uint8Array(total);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.byteLength}return out.buffer;
}
async function encodeCustomTemplate(t){
  const gz=await gzipBytes(CustomTemplate.toBinarySTL(t.source.positions,t.source.indices,'Caviot custom template: '+t.name.slice(0,50)));
  // Skip building a data URL that could never be embedded (base64 is 4/3 of the bytes plus the prefix).
  const fits=Math.ceil(gz.byteLength/3)*4+64<=CUSTOM_EMBED_LIMIT,dataUrl=fits?await blobToDataURL(new Blob([gz],{type:'application/gzip'})):null;
  return{gz,dataUrl:dataUrl&&dataUrl.length<=CUSTOM_EMBED_LIMIT?dataUrl:null,bytes:gz.byteLength};
}
function customTemplateProjectEntry(){
  if(!customTemplate||AppState.templateId!=='custom-stl')return null;
  if(!customTemplate.embed)throw Error('The custom template is still being packed. Try saving again in a moment.');
  if(!customTemplate.embed.dataUrl)toast('The template STL is too large to embed ('+(customTemplate.embed.bytes/1048576).toFixed(1)+' MB compressed). Keep the STL file; you will be asked to upload it when reopening.','error');
  return{kind:'custom-stl',name:customTemplate.name,triangles:customTemplate.report.triangles,repaired:!!customTemplate.repaired,orientation:CustomTemplate.normalizeOrientation(customTemplate.orientation),mesh:customTemplate.embed.dataUrl};
}
// Returns a notice for the "Project opened" toast (a separate toast would be replaced by it at once).
async function restoreProjectTemplate(p){
  const t=p.version===4?p.template:null;
  if(t&&t.mesh){
    try{const bytes=new Uint8Array(await (await fetch(t.mesh)).arrayBuffer()),buffer=await gunzipBytes(bytes);await useCustomTemplateBuffer(buffer,t.name,t.orientation,{activate:false,repaired:t.repaired,quiet:true});p.settings.templateId='custom-stl';AppState.templateId='custom-stl';setActiveTemplateBase(customTemplate.display||customTemplate.base);ensureCustomPrint();setTimeout(()=>templateView('front'),50);return}
    catch(error){if(isCancelled(error))throw Error('Another template was loaded while opening the project. Open it again.');p.settings.templateId='etsyfolger-v1';activateBuiltinTemplate();return 'The embedded template could not be loaded: '+error.message+' Using ETSYFOLGER instead.'}
  }
  if(t&&!t.mesh){if(customTemplate&&customTemplate.name===t.name){p.settings.templateId='custom-stl';AppState.templateId='custom-stl';setActiveTemplateBase(customTemplate.display||customTemplate.base);ensureCustomPrint();return 'Using the loaded template '+t.name+'; check that it is the same STL.'}p.settings.templateId='etsyfolger-v1';activateBuiltinTemplate();return 'This project used the custom template "'+t.name+'", which was too large to embed. Upload that STL with Import STL template.'}
  if(p.settings.templateId==='custom-stl'&&!t)p.settings.templateId='etsyfolger-v1';
  if(p.settings.templateId==='etsyfolger-v1')activateBuiltinTemplate();
  return '';
}
function fallbackToBuiltin(){if(AppState.templateId!=='custom-stl')return;AppState.templateId='etsyfolger-v1';if(builtinTemplateBase){activateBuiltinTemplate();projectStateToUI();if(AppState.image)scheduleRebuild(true);else renderTemplateBlank();templateView('front')}else projectStateToUI()}
// Custom templates are never remembered between visits: the studio always starts on ETSYFOLGER and a custom
// template loads only from an upload or a project that embeds one. Earlier builds kept the last upload in
// IndexedDB and restored it on start-up; delete that database so an old template stops coming back.
function forgetStoredCustomTemplates(){try{self.indexedDB?.deleteDatabase('icaviot.templates.v1')}catch{}}
// Keep the displayed surface in step with templateId whenever settings are reloaded (undo/redo, project open).
function syncTemplateBaseToState(){
  if(AppState.templateId==='custom-stl'){if(customTemplate){const base=customTemplate.display||customTemplate.base;if(templateBase!==base){setActiveTemplateBase(base);ensureCustomPrint()}}else if(builtinTemplateBase&&!customLoading){AppState.templateId='etsyfolger-v1';activateBuiltinTemplate()}}
  else if(AppState.templateId==='etsyfolger-v1')activateBuiltinTemplate();
}
const customOriginalLoadSettings=loadSettings;loadSettings=function(...args){customOriginalLoadSettings(...args);syncTemplateBaseToState()};
const customStartup=()=>{forgetStoredCustomTemplates();syncCustomPanel();fallbackToBuiltin()};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',customStartup);else customStartup();
