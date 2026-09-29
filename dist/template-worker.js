'use strict';
self.window=self;
importScripts('mesh-core.js','template-core.js','mesh-repair.js','template-sharp.js','custom-template.js');
const preparedCache=new Map();
async function getTemplate(quality){
  if(!preparedCache.has(quality))preparedCache.set(quality,(async()=>{const response=await fetch('templates/ETSYFOLGER-'+quality+'.mesh');if(!response.ok)throw Error('The sleeve surface could not be loaded. Please reload.');const raw=await response.arrayBuffer();const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));return SleeveTemplate.decode(await new Response(stream).arrayBuffer())})());
  try{return await preparedCache.get(quality)}catch(error){preparedCache.delete(quality);throw error}
}
// Custom STL templates arrive with the job; the latest one per quality is cached here.
const customCache=new Map();
function resolveTemplate(data,quality){
  const t=data.template;if(!t||t.kind!=='custom')return getTemplate(quality);
  const key=t.key+':'+quality;
  if(t.prepared){for(const k of customCache.keys())if(k.endsWith(':'+quality))customCache.delete(k);customCache.set(key,t.prepared)}
  if(customCache.has(key))return customCache.get(key);
  if(t.base){const prepared=CustomTemplate.prepare(t.base,{quality,onProgress:message=>postMessage({id:data.id,progress:message})});customCache.set(key,prepared);return prepared}
  throw Error('The custom template is not loaded in this preview. Change a setting to retry, or upload the STL again.');
}
const transferPrepared=p=>[p.positions.buffer,p.normals.buffer,p.indices.buffer,p.distance.buffer,p.thickness.buffer,p.uv.buffer,p.outer.buffer];
function customPrepare(data){
  const progress=message=>postMessage({id:data.id,progress:message});
  let source=data.source,report=data.report;
  if(data.buffer||data.repair){progress(data.buffer?'Reading STL':'Repairing template');const loaded=CustomTemplate.load(data.buffer||CustomTemplate.toBinarySTL(source.positions,source.indices),{repair:!!data.repair});source=loaded.source;report=loaded.report}
  progress('Orienting');const base=CustomTemplate.orient({...source,closed:!!report?.closed},data.orientation),display=CustomTemplate.decimate(base);
  progress('Preparing preview surface');const preview=CustomTemplate.prepare(display,{quality:'preview',onProgress:progress});
  const sendSource=!!(data.buffer||data.repair),baseOut={positions:base.positions,indices:base.indices,height:base.height,bounds:base.bounds,chart:base.chart,closed:base.closed,orientation:base.orientation};
  const displayOut=display===base?null:{positions:display.positions,indices:display.indices,height:display.height,bounds:display.bounds,chart:display.chart,closed:display.closed,orientation:display.orientation,decimated:true,sourceTriangles:display.sourceTriangles};
  const transfer=[...transferPrepared(preview)];if(sendSource)transfer.push(source.positions.buffer);
  // Base positions are copied (not transferred) because print preparation below still needs them.
  postMessage({id:data.id,stage:'ready',source:sendSource?source:null,report,base:baseOut,display:displayOut,preview},transfer);
  if(data.skipPrint)return;
  progress('Preparing print surface');const print=CustomTemplate.prepare(base,{quality:'print',onProgress:progress});
  postMessage({id:data.id,stage:'print',print},transferPrepared(print));
}
self.onmessage=async({data})=>{
  try{
    if(data.type==='custom-prepare'){customPrepare(data);return}
    if(data.type==='custom-print'){const print=CustomTemplate.prepare(data.base,{quality:'print',onProgress:message=>postMessage({id:data.id,progress:message})});postMessage({id:data.id,stage:'print',print},transferPrepared(print));return}
    const prepared=await resolveTemplate(data,data.type==='export'?'print':'preview');
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
