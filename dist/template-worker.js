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
// Contour spacing: desktop defaults, or the lighter phone limits the page sends (options.exportSpacing/previewSpacing).
const jobSpacing=data=>data.type==='export'?data.options?.exportSpacing||.14:data.options?.previewSpacing||.24;
const buildWith=(prepared,options,data)=>options.sharp?SharpSleeve.buildAdaptive(prepared,{...options,sharpSpacing:jobSpacing(data),weldSafe:data.template?.kind==='custom'}):SleeveTemplate.build(prepared,options);
// Textured custom templates (bumps, discs, knurling): embossed side designs become raised pads above the texture
// (CustomTemplate.buildTexturePads) instead of being draped over it, which would break them into fragments.
// Everything else - deboss, bottom logos, and all ETSYFOLGER jobs - takes the normal path unchanged.
function buildRelief(prepared,data){
  const options=data.options,list=options.designs;
  if(data.template?.kind!=='custom'||!prepared.texture?.textured||!list?.length)return buildWith(prepared,options,data);
  if(data.template.raiseOnTexture===false)return noteDeboss(buildWith(prepared,options,data),list,options);
  const raise=list.map(d=>!!d.heightmap&&!d.surface&&!(d.negative??options.negative));
  if(!raise.includes(true))return noteDeboss(buildWith(prepared,options,data),list,options);
  const rest=list.filter((d,i)=>!raise[i]),picked=list.filter((d,i)=>raise[i]).map(d=>({...d,sharp:d.sharp??options.sharp,maxHeight:d.maxHeight??options.maxHeight}));
  const base=buildWith(prepared,{...options,designs:rest,heightmap:null},data);
  const pads=CustomTemplate.buildTexturePads(prepared,picked,{spacing:jobSpacing(data)});
  const nb=base.positions.length/3,fb=base.indices.length/3,positions=new Float32Array(base.positions.length+pads.positions.length),indices=new Uint32Array(base.indices.length+pads.indices.length);
  positions.set(base.positions);positions.set(pads.positions,base.positions.length);indices.set(base.indices);for(let i=0;i<pads.indices.length;i++)indices[base.indices.length+i]=pads.indices[i]+nb;
  // Pads carry full relief colour in the preview; their side walls are listed like sharp-edge walls.
  const amplitude=new Float32Array(positions.length/3);amplitude.set(base.amplitude.subarray(0,nb));amplitude.fill(1,nb);
  const walls=new Uint32Array((base.walls?.length||0)+pads.walls.length);if(base.walls)walls.set(base.walls);for(let i=0;i<pads.walls.length;i++)walls[(base.walls?.length||0)+i]=pads.walls[i]+fb;
  const byRest=base.info.affectedByDesign||rest.map(()=>base.info.affected?1:0);let r=0,k=0;
  const affectedByDesign=list.map((d,i)=>raise[i]?pads.counts[k++]:byRest[r++]??0),padCount=pads.counts.reduce((a,b)=>a+b,0);
  return noteDeboss({positions,indices,amplitude,walls,info:{...base.info,affected:(base.info.affected||0)+padCount,affectedByDesign,raised:pads.counts.filter(Boolean).length,textureDepth:prepared.texture.depth}},list,options);
}
// Deboss cannot be carved through bumps without a boolean cut, so on a textured surface it reaches only the
// smooth patches (often nothing). Count those designs so preview and export can say why.
function noteDeboss(result,list,options){const n=list.filter(d=>d.heightmap&&!d.surface&&(d.negative??options.negative)).length;if(n)result.info.textureDeboss=n;return result}
self.onmessage=async({data})=>{
  try{
    if(data.type==='custom-prepare'){customPrepare(data);return}
    if(data.type==='custom-print'){const print=CustomTemplate.prepare(data.base,{quality:'print',onProgress:message=>postMessage({id:data.id,progress:message})});postMessage({id:data.id,stage:'print',print},transferPrepared(print));return}
    // Exports report their stage so the UI can show progress (and knows the worker is alive) on long jobs.
    const stage=data.type==='export'?message=>postMessage({id:data.id,progress:message,exportStage:true}):()=>{};
    stage('Loading template');const prepared=await resolveTemplate(data,data.type==='export'&&data.options?.exportSurface!=='preview'?'print':'preview');
    stage('Forming relief');const result=buildRelief(prepared,data);
    if(data.type==='export'){
      // Repair validates its own output, so its report doubles as the export mesh check below.
      let checked=null;
      if(data.repair){stage('Making watertight');const repaired=MeshRepair.repair(result.positions,result.indices);if(!repaired.report.closed)throw Error('Repair could not close this mesh. Reduce relief depth or adjust placement.');result.positions=repaired.positions;result.indices=repaired.indices;const r=repaired.report;checked={triCount:r.triCount,zeroArea:r.zeroArea,boundary:r.boundary,nonManifold:r.nonManifold};}
      if((data.options.designs?.length||data.options.heightmap)&&result.info.affected===0)throw Error('The design is not on a printable surface. Move it, resize it, or check background removal.');
      const missing=result.info.affectedByDesign?.indexOf(0)??-1;
      if(missing>=0){
        // Name the bottom logo separately: its preview can succeed on the finer preview surface while a very
        // dense custom template keeps its original (unrefined) underside triangles for export.
        if(result.info.textureDeboss&&(data.options.designs?.[missing]?.negative??data.options.negative))throw Error('Deboss cannot be cut into this template\'s textured surface. Use Emboss for that side; embossed designs are raised above the texture.');
        if(data.options.designs?.[missing]?.surface!=='underside')throw Error('One side has no artwork on a printable surface. Check its placement and background removal.');
        throw Error(data.template?.kind==='custom'?'The bottom logo does not reach a printable part of this template\'s underside. Move or enlarge it, or use a simpler STL so the underside keeps more detail.':'The bottom logo is not on a printable surface. Check its placement.');
      }
      if(!checked)stage('Checking mesh');const v=checked||MeshCore.validateMesh(result.positions,result.indices);
      if(v.boundary||v.nonManifold||v.zeroArea)throw Error('Mesh check: '+v.zeroArea+' collapsed faces, '+v.boundary+' open edges, '+v.nonManifold+' non-manifold edges. Reduce depth or move the design.');
      // Export Z-up for slicers, preserving the template shape and millimeter scale.
      const positions=result.positions;for(let i=0;i<positions.length;i+=3){const y=positions[i+1];positions[i+1]=-positions[i+2];positions[i+2]=y}
      stage('Writing '+(data.format==='obj'?'OBJ':'STL'));
      if(data.format==='obj')postMessage({id:data.id,validation:v,info:result.info,text:MeshCore.exportOBJ(positions,result.indices,data.template?.kind==='custom'?6:4)});
      else{const buffer=MeshCore.exportSTL(positions,result.indices);postMessage({id:data.id,validation:v,info:result.info,buffer},[buffer])}
    }else{
      const indices=new Uint32Array(result.indices);postMessage({id:data.id,positions:result.positions,indices,amplitude:result.amplitude,walls:result.walls,info:result.info},[result.positions.buffer,indices.buffer,result.amplitude.buffer]);
    }
  }catch(error){
    // For custom templates the usual cause is template density, not the artwork, so say what helps.
    const message=error.code==='MESH_BUDGET'&&data.template?.kind==='custom'?'This template is too dense for Sharp edges with this artwork. Turn off Sharp edges (logos), make the artwork smaller, or simplify the STL.':error.code==='MESH_BUDGET'&&data.options?.meshBudget?'This design needs more mesh detail than is safe on this device. Make the artwork smaller or simpler, or export it on a computer.':error.message||'Template processing failed.';
    postMessage({id:data.id,error:message});
  }
};
