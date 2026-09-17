'use strict';
self.window=self;
importScripts('mesh-core.js','mesh-repair.js');
self.onmessage=({data})=>{
  try{
    let mesh=MeshCore.buildMesh(data.options);
    if(data.repair){mesh=MeshRepair.repair(mesh.positions,mesh.indices);if(!mesh.report.closed)throw Error("Repair could not close this mesh. Open edges: "+mesh.report.boundary+"; non-manifold edges: "+mesh.report.nonManifold+"; winding conflicts: "+mesh.report.winding);}
    if(!mesh.indices.length)throw Error('No printable geometry. Adjust background removal or disable silhouette trim.');
    if(!mesh.positions.every(Number.isFinite))throw Error('Geometry contains invalid coordinates. Check dimensions.');
    const validation=MeshCore.validateMesh(mesh.positions,mesh.indices);
    if(validation.boundary||validation.nonManifold||validation.zeroArea)throw Error('Mesh has open edges or degenerate faces. Adjust the design or disable silhouette trim before exporting.');
    if(data.format==='obj')postMessage({validation,text:MeshCore.exportOBJ(mesh.positions,mesh.indices)});
    else{const buffer=MeshCore.exportSTL(mesh.positions,mesh.indices);postMessage({validation,buffer},[buffer]);}
  }catch(error){postMessage({error:error.message||'Could not export this model.'});}
};
