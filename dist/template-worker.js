'use strict';
self.window=self;
importScripts('mesh-core.js','template-core.js','mesh-repair.js','template-sharp.js');
const preparedCache=new Map();
async function getTemplate(quality){
  if(!preparedCache.has(quality))preparedCache.set(quality,(async()=>{const response=await fetch('templates/ETSYFOLGER-'+quality+'.mesh');if(!response.ok)throw Error('The sleeve surface could not be loaded. Please reload.');const raw=await response.arrayBuffer();const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));return SleeveTemplate.decode(await new Response(stream).arrayBuffer())})());
  try{return await preparedCache.get(quality)}catch(error){preparedCache.delete(quality);throw error}
}
self.onmessage=async({data})=>{
  try{
    const prepared=await getTemplate(data.type==='export'?'print':'preview');
    const result=data.options.sharp?SharpSleeve.buildAdaptive(prepared,{...data.options,sharpSpacing:data.type==='export'?.14:.24}):SleeveTemplate.build(prepared,data.options);
    if(data.type==='export'){
      if(data.repair){const repaired=MeshRepair.repair(result.positions,result.indices);if(!repaired.report.closed)throw Error('Repair could not close this mesh. Reduce relief depth or adjust placement.');result.positions=repaired.positions;result.indices=repaired.indices;}
      if((data.options.designs?.length||data.options.heightmap)&&result.info.affected===0)throw Error('The design is not on a printable surface. Move it, resize it, or check background removal.');
      if(result.info.affectedByDesign?.some(n=>n===0))throw Error('One side has no artwork on a printable surface. Check its placement and background removal.');
      const v=MeshCore.validateMesh(result.positions,result.indices);
      if(v.boundary||v.nonManifold||v.zeroArea)throw Error('Mesh check: '+v.zeroArea+' collapsed faces, '+v.boundary+' open edges, '+v.nonManifold+' non-manifold edges. Reduce depth or move the design.');
      // Export Z-up for slicers, preserving the template shape and millimeter scale.
      const positions=result.positions;for(let i=0;i<positions.length;i+=3){const y=positions[i+1];positions[i+1]=-positions[i+2];positions[i+2]=y}
      if(data.format==='obj')postMessage({id:data.id,validation:v,info:result.info,text:MeshCore.exportOBJ(positions,result.indices)});
      else{const buffer=MeshCore.exportSTL(positions,result.indices);postMessage({id:data.id,validation:v,info:result.info,buffer},[buffer])}
    }else{
      const indices=new Uint32Array(result.indices);postMessage({id:data.id,positions:result.positions,indices,amplitude:result.amplitude,walls:result.walls,info:result.info},[result.positions.buffer,indices.buffer,result.amplitude.buffer]);
    }
  }catch(error){postMessage({id:data.id,error:error.message||'Template processing failed.'})}
};
