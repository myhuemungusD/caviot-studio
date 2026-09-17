'use strict';
let repairOnExport=false;
const repairPanel=document.createElement('div');repairPanel.className='mesh-repair-panel';repairPanel.innerHTML='<button class="btn btn-ghost btn-sm" id="makeWatertight">Make watertight</button><span id="repairStatus" role="status">Checks the current mesh; preserves the sleeve cavity.</span>';
document.querySelector('.canvas-wrap')?.appendChild(repairPanel);
if(!repairPanel.isConnected)document.getElementById('threeContainer').parentElement.appendChild(repairPanel);
const repairButton=document.getElementById('makeWatertight'),repairStatus=document.getElementById('repairStatus');
repairButton.onclick=()=>{
 if(!previewMesh?.positions?.length){repairStatus.textContent='Add a design or load the sleeve first.';return}
 if(exportBusy)return;
 repairButton.disabled=true;repairStatus.textContent='Checking and repairing mesh…';const revision=projectRevision,source=previewMesh,worker=new Worker('repair-worker.js');
 const end=()=>{clearTimeout(timer);worker.terminate();repairButton.disabled=false};
 const timer=setTimeout(()=>{end();repairStatus.textContent='Repair timed out. Reduce mesh detail and try again.'},90000);
 worker.onerror=()=>{end();repairStatus.textContent='Repair could not run. Reload and try again.'};
 worker.onmessage=({data})=>{end();if(data.error){repairStatus.textContent=data.error;return}if(projectRevision!==revision||previewMesh!==source){repairStatus.textContent='Design changed during repair. Run the check again.';return}
 const r=data.report;repairOnExport=true;
 // Keep the original appearance when no geometry changed.
 if(r.welded||r.removed||r.filled){replaceTemplateMesh(data.positions,data.indices);dirty()}
 repairStatus.textContent=(r.closed?'Closed mesh: no open edges or non-manifold edges/vertices.':`Remaining: ${r.boundary} open edges, ${r.nonManifold} non-manifold edges, ${r.nonManifoldVertices} non-manifold vertices, ${r.winding} winding conflicts.`)+` Welded ${r.welded}; removed ${r.removed} faces; patched ${r.filled} tiny holes. Repair also runs at export resolution. Self-intersections are not checked.`;
 };
 worker.postMessage({positions:source.positions,indices:source.indices});
};
document.querySelector('.shell').addEventListener('input',()=>{repairStatus.textContent=repairOnExport?'Design changed. Repair will run again on export.':'Checks the current mesh; preserves the sleeve cavity.'});
const beforeRepairReplace=replaceTemplateMesh;replaceTemplateMesh=function(...args){beforeRepairReplace(...args);repairStatus.textContent=repairOnExport?'Design updated. Check again or export with repair enabled.':'Checks the current mesh; preserves the sleeve cavity.'};
