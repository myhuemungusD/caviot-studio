'use strict';
/* Upload any STL as the sleeve template. Heavy work (parse, weld, orientation,
   surface preparation) runs in template-worker.js; this file wires the UI. */
let customTemplate=null,customPrepWorker=null,customPrepSeq=0,customLoading=false;
const CUSTOM_EMBED_LIMIT=24*1024*1024,CUSTOM_DB='icaviot.templates.v1',CUSTOM_STORE='templates';
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
 <div class="custom-template-actions"><button class="btn btn-ghost btn-sm" id="repairTemplateBtn" type="button">Make template watertight</button><button class="btn btn-ghost btn-sm" id="removeTemplateBtn" type="button">Remove template</button></div>
</div>`;
$('templateDescription').after(customPanel);
const customStyle=document.createElement('style');customStyle.textContent=`.custom-template-tools{margin-top:8px}.custom-template-actions{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.custom-orient-grid{display:grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:center;margin:8px 0}.custom-orient-grid label{font-size:12px}.custom-template-name{font-weight:600;margin:8px 0 2px;overflow-wrap:anywhere}#customTemplateStatus.error{color:var(--warning,#f5a524)}#customTemplateStatus.bad{color:var(--danger,#ff5d5d)}`;document.head.appendChild(customStyle);
const customInput=$('templateStlInput');
function openTemplateUpload(){customInput.value='';customInput.click()}
$('uploadTemplateBtn').onclick=openTemplateUpload;
$('flattenStlBtn').onclick=()=>els.stlInput&&els.stlInput.click();
customInput.onchange=()=>{const file=customInput.files?.[0];if(file)loadCustomTemplateFile(file)};
function customStatus(message,level=''){const el=$('customTemplateStatus');el.textContent=message;el.classList.toggle('error',level==='warn');el.classList.toggle('bad',level==='bad')}
function customOrientationFromUI(){return CustomTemplate.normalizeOrientation({up:$('customUp').value,turn:Number($('customTurn').value),units:$('customUnits').value,autoAlign:$('customAutoAlign').checked})}
function customOrientationToUI(o){$('customUp').value=o.up;$('customTurn').value=String(o.turn);$('customUnits').value=o.units;$('customAutoAlign').checked=o.autoAlign}
function syncCustomPanel(){
  const option=$('templateChoice').querySelector('option[value="custom-stl"]');option.textContent=customTemplate?'Custom STL · '+customTemplate.name.slice(0,40):'Custom STL · upload…';
  $('customTemplatePanel').hidden=!customTemplate;
  for(const id of ['customUp','customTurn','customUnits','customAutoAlign','repairTemplateBtn','removeTemplateBtn','uploadTemplateBtn'])$(id).disabled=customLoading&&id!=='removeTemplateBtn'||exportBusy;
  if(customTemplate){const b=customTemplate.base.bounds,dims=[b.max[0]-b.min[0],b.max[2]-b.min[2],b.max[1]-b.min[1]].map(v=>v.toFixed(1)).join(' × ');$('customTemplateInfo').textContent=customTemplate.name+' · '+dims+' mm · '+customTemplate.report.triangles.toLocaleString()+' triangles';}
}

// ---------- Worker orchestration ----------
function prepareCustomTemplate(job){
  if(customPrepWorker)customPrepWorker.terminate();
  const id=++customPrepSeq,worker=new Worker('template-worker.js');customPrepWorker=worker;customLoading=true;syncCustomPanel();
  return new Promise((resolve,reject)=>{
    let ready=null;
    const end=()=>{worker.terminate();if(customPrepWorker===worker){customPrepWorker=null;customLoading=false}syncCustomPanel()};
    worker.onerror=e=>{end();const error=Error('The template worker stopped'+(e.message?': '+e.message:'')+'. The mesh may be too large for this browser.');if(!ready)reject(error);else customStatus(error.message,'warn')};
    worker.onmessage=({data})=>{
      if(data.id!==id)return;
      if(data.progress){if(!ready){templateStatus('Loading template: '+data.progress+'…');customStatus('Loading: '+data.progress+'…')}return}
      if(data.error){end();const error=Error(data.error);if(!ready)reject(error);else{customStatus('Print surface could not be prepared: '+data.error+' Export will try again.','warn')}return}
      if(data.stage==='ready'){
        const source=data.source||job.source,t={key:'custom-'+Date.now()+'-'+id,name:job.name,source,report:data.report,orientation:data.base.orientation,base:data.base,display:data.display,preview:data.preview,print:null,repaired:!!(job.repaired||job.repair||data.report.repaired),embed:null};
        ready=t;end();resolve(t);
      }
    };
    const message={type:'custom-prepare',id,orientation:job.orientation||customDefaults,repair:!!job.repair,skipPrint:true};
    if(job.buffer){message.buffer=job.buffer;worker.postMessage(message,[job.buffer])}else{message.source=job.source;message.report=job.report;worker.postMessage(message)}
  });
}
// The full-resolution print surface is prepared in the background once a custom template is in use.
function ensureCustomPrint(t=customTemplate){
  if(!t||t.print||t.printWorker)return;const worker=new Worker('template-worker.js');t.printWorker=worker;
  const done=()=>{worker.terminate();t.printWorker=null};
  worker.onmessage=({data})=>{if(data.progress)return;done();if(data.error){if(customTemplate===t)customStatus('Print surface could not be prepared in advance: '+data.error+' Export will try again.','warn');return}t.print=data.print;if(customTemplate===t){const s=customSummary(t);customStatus(s.text,s.level)}};
  worker.onerror=()=>{done();if(customTemplate===t)customStatus('Print surface could not be prepared in advance; export will prepare it.','warn')};
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
  notes.push(t.print?'Print surface ready ('+t.print.spacing.toFixed(2)+' mm spacing).':t.printWorker?'Preparing the print surface in the background…':'The print surface is prepared when you use this template.');
  if(!issues.length&&!r.nonOrientable)notes.unshift('Closed, manifold mesh.');
  if(r.repairReport){const x=r.repairReport;notes.unshift('Make template watertight: welded '+x.welded+' vertices, removed '+x.removed+' faces, patched '+x.filled+' tiny holes'+(issues.length?'; larger holes remain.':'.'))}
  return{text:notes.join(' '),level};
}
async function loadCustomTemplateFile(file){
  if(exportBusy){toast('Wait for the export to finish.','error');return}
  if(!/\.stl$/i.test(file.name)&&!/stl/i.test(file.type))toast('This file does not end in .stl; trying anyway.','error');
  if(file.size>CustomTemplate.MAX_BYTES){toast('STL is larger than 100 MB. Simplify it first.','error');customStatus('STL is larger than 100 MB. Simplify it first.','bad');return}
  const buffer=await file.arrayBuffer();return useCustomTemplateBuffer(buffer,file.name.replace(/\.stl$/i,'').slice(0,120)||'Custom STL',customDefaults,{activate:true});
}
async function useCustomTemplateBuffer(buffer,name,orientation,{activate=true,repaired=false,quiet=false}={}){
  $('customTemplatePanel').hidden=false;$('customTemplateInfo').textContent=name;customStatus('Reading '+name+'…');templateStatus('Loading template '+name+'…');
  try{
    const t=await prepareCustomTemplate({buffer,name,orientation,repaired});
    installCustomTemplate(t,activate);if(!quiet)toast('Template ready: '+name,'success');return t;
  }catch(error){
    const message='Could not use this STL: '+error.message;customStatus(message,'bad');templateStatus(message,true);if(!quiet)toast(message,'error');
    if(!customTemplate)$('customTemplatePanel').hidden=true;else syncCustomPanel();
    throw error;
  }
}
function installCustomTemplate(t,activate){
  if(customTemplate&&customTemplate!==t)dropCustomPrint(customTemplate);customTemplate=t;customOrientationToUI(CustomTemplate.normalizeOrientation(t.orientation));syncCustomPanel();const summary=customSummary(t);customStatus(summary.text,summary.level);
  t.embedPromise=encodeCustomTemplate(t).then(embed=>{t.embed=embed;storeCustomTemplate(t,embed);return embed}).catch(()=>null);
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
  if(value==='custom-stl'){if(!customTemplate){openTemplateUpload();return false}setActiveTemplateBase(customTemplate.display||customTemplate.base);ensureCustomPrint();setTimeout(()=>templateView('front'));return true}
  if(value==='etsyfolger-v1'){if(!builtinTemplateBase){toast(builtinTemplateError?builtinTemplateError.message:'The ETSYFOLGER template is still loading.','error');return false}activateBuiltinTemplate();setTimeout(()=>templateView('front'));}
  return true;
}
templateJobData=function(worker,quality){
  if(AppState.templateId!=='custom-stl'||!customTemplate)return undefined;const key=customTemplate.key;
  if(quality==='preview'){if(worker.customTemplateKey===key)return{kind:'custom',key};worker.customTemplateKey=key;return{kind:'custom',key,prepared:customTemplate.preview}}
  return customTemplate.print?{kind:'custom',key,prepared:customTemplate.print}:{kind:'custom',key,base:customTemplate.base};
};
const customOriginalInfo=templateInfo;templateInfo=function(){
  if(AppState.templateId!=='custom-stl'||!customTemplate)return customOriginalInfo();
  const h=customTemplate.base.height;
  return{label:customTemplate.name,file:customTemplate.name.replace(/[^\p{L}\p{N}_-]/gu,'').slice(0,40)||'custom',description:'Your uploaded STL. Its geometry is kept; artwork follows the outer surface.',surface:customTemplate.name.slice(0,30)+' · custom template',stats:'Custom STL · '+h.toFixed(1)+' mm tall',kept:'Template geometry kept',ready:'Your template is ready. Add an image, pattern or text.',exportHint:customTemplate.report.closed?'':'Your template itself is not watertight: use Make template watertight in the Sleeve template panel, or repair the STL in your mesh tool.'};
};
// Placement helpers read the chart from the template when it has one (custom templates carry theirs).
const customOriginalProfile=SleeveTemplate.profile;SleeveTemplate.profile=base=>base&&base.chart?base.chart:customOriginalProfile(base);
if(typeof fitBottomBrand==='function'){const originalFit=fitBottomBrand;fitBottomBrand=function(){originalFit();if(AppState.templateId==='custom-stl')Object.assign(bottomBrand,{centerX:0,centerZ:0})}}
const customOriginalSync=syncTemplateUI;syncTemplateUI=function(){customOriginalSync();syncCustomPanel()};

// ---------- Orientation, repair, removal ----------
function reorientCustomTemplate(repair=false){
  if(!customTemplate)return;const previous=customTemplate,orientation=customOrientationFromUI();customStatus(repair?'Repairing…':'Re-orienting…');
  prepareCustomTemplate({source:previous.source,report:previous.report,name:previous.name,orientation,repair,repaired:previous.repaired||repair}).then(t=>{
    installCustomTemplate(t,AppState.templateId==='custom-stl');
    if(repair){const r=t.report.repairReport;toast(t.report.closed?'Template is now watertight':'Template still has problems — see the template panel',t.report.closed?'success':'error');}
    dirty();
  }).catch(error=>{customStatus((repair?'Repair failed: ':'Could not re-orient: ')+error.message,'bad');customOrientationToUI(CustomTemplate.normalizeOrientation(previous.orientation))});
}
for(const id of ['customUp','customTurn','customUnits','customAutoAlign'])$(id).addEventListener('change',e=>{e.stopPropagation();reorientCustomTemplate(false)});
$('repairTemplateBtn').onclick=()=>reorientCustomTemplate(true);
$('removeTemplateBtn').onclick=()=>{if(customPrepWorker){customPrepWorker.terminate();customPrepWorker=null}const wasActive=AppState.templateId==='custom-stl';dropCustomPrint(customTemplate);customTemplate=null;deleteStoredCustomTemplate();syncCustomPanel();if(wasActive){AppState.templateId='etsyfolger-v1';activateBuiltinTemplate();projectStateToUI();if(templateBase){if(AppState.image)scheduleRebuild(true);else renderTemplateBlank();templateView('front')}saveSettings()}toast('Custom template removed','success');dirty()};

// ---------- Persistence: project files and this browser ----------
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob)})}
async function gzipBytes(buffer){const stream=new Blob([buffer]).stream().pipeThrough(new CompressionStream('gzip'));return new Uint8Array(await new Response(stream).arrayBuffer())}
async function gunzipBytes(bytes){const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));return await new Response(stream).arrayBuffer()}
async function encodeCustomTemplate(t){
  const gz=await gzipBytes(CustomTemplate.toBinarySTL(t.source.positions,t.source.indices,'Caviot custom template: '+t.name.slice(0,50)));
  const dataUrl=await blobToDataURL(new Blob([gz],{type:'application/gzip'}));return{gz,dataUrl:dataUrl.length<=CUSTOM_EMBED_LIMIT?dataUrl:null,bytes:gz.byteLength};
}
function customTemplateProjectEntry(){
  if(!customTemplate||AppState.templateId!=='custom-stl')return null;
  if(!customTemplate.embed)throw Error('The custom template is still being packed. Try saving again in a moment.');
  if(!customTemplate.embed.dataUrl)toast('The template STL is too large to embed ('+(customTemplate.embed.bytes/1048576).toFixed(1)+' MB compressed). Keep the STL file; you will be asked to upload it when reopening.','error');
  return{kind:'custom-stl',name:customTemplate.name,triangles:customTemplate.report.triangles,repaired:!!customTemplate.repaired,orientation:CustomTemplate.normalizeOrientation(customTemplate.orientation),mesh:customTemplate.embed.dataUrl};
}
async function restoreProjectTemplate(p){
  const t=p.version===4?p.template:null;
  if(t&&t.mesh){
    try{const bytes=new Uint8Array(await (await fetch(t.mesh)).arrayBuffer()),buffer=await gunzipBytes(bytes);await useCustomTemplateBuffer(buffer,t.name,t.orientation,{activate:false,repaired:t.repaired,quiet:true});p.settings.templateId='custom-stl';AppState.templateId='custom-stl';setActiveTemplateBase(customTemplate.display||customTemplate.base);ensureCustomPrint();setTimeout(()=>templateView('front'),50);return}
    catch(error){toast('The embedded template could not be loaded: '+error.message+' Using ETSYFOLGER instead.','error');p.settings.templateId='etsyfolger-v1';activateBuiltinTemplate();return}
  }
  if(t&&!t.mesh){if(customTemplate&&customTemplate.name===t.name){p.settings.templateId='custom-stl';AppState.templateId='custom-stl';setActiveTemplateBase(customTemplate.display||customTemplate.base);ensureCustomPrint();toast('Using the loaded template '+t.name+'. Check that it is the same STL.','success');return}toast('This project used the custom template "'+t.name+'", which was too large to embed. Upload that STL with Import STL template.','error');p.settings.templateId='etsyfolger-v1';}
  if(p.settings.templateId==='custom-stl'&&!t)p.settings.templateId='etsyfolger-v1';
  if(p.settings.templateId==='etsyfolger-v1')activateBuiltinTemplate();
}
function openCustomDB(){return new Promise((resolve,reject)=>{if(!self.indexedDB)return reject(Error('No IndexedDB'));const r=indexedDB.open(CUSTOM_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(CUSTOM_STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function storeCustomTemplate(t,embed){try{if(embed.bytes>60*1024*1024)return;const db=await openCustomDB();db.transaction(CUSTOM_STORE,'readwrite').objectStore(CUSTOM_STORE).put({name:t.name,gz:embed.gz,orientation:CustomTemplate.normalizeOrientation(t.orientation),repaired:!!t.repaired},'current')}catch{}}
async function deleteStoredCustomTemplate(){try{const db=await openCustomDB();db.transaction(CUSTOM_STORE,'readwrite').objectStore(CUSTOM_STORE).delete('current')}catch{}}
async function readStoredCustomTemplate(){const db=await openCustomDB();return await new Promise((resolve,reject)=>{const r=db.transaction(CUSTOM_STORE).objectStore(CUSTOM_STORE).get('current');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}
function fallbackToBuiltin(){if(AppState.templateId!=='custom-stl')return;AppState.templateId='etsyfolger-v1';if(builtinTemplateBase){activateBuiltinTemplate();projectStateToUI();if(AppState.image)scheduleRebuild(true);else renderTemplateBlank();templateView('front')}else projectStateToUI()}
async function restoreStoredCustomTemplate(){
  const wanted=AppState.templateId==='custom-stl';let record=null;
  try{record=await readStoredCustomTemplate()}catch{}
  if(!record){fallbackToBuiltin();return}
  if(wanted)templateStatus('Restoring your custom template '+record.name+'…');
  try{const buffer=await gunzipBytes(record.gz);await useCustomTemplateBuffer(buffer,record.name,record.orientation,{activate:wanted,repaired:record.repaired,quiet:true})}
  catch{fallbackToBuiltin()}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{syncCustomPanel();restoreStoredCustomTemplate()});else{syncCustomPanel();restoreStoredCustomTemplate()}
