import fs from 'node:fs';import zlib from 'node:zlib';import assert from 'node:assert/strict';
globalThis.window=globalThis;await import('./dist/template-core.js');await import('./dist/mesh-core.js');
const data=fs.readFileSync('dist/templates/ETSYFOLGER.stl'),base=SleeveTemplate.parse(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
for(const quality of ['preview','print']){
  console.time(quality);const raw=zlib.gunzipSync(fs.readFileSync('dist/templates/ETSYFOLGER-'+quality+'.mesh')),p=SleeveTemplate.decode(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));console.log(quality,'base mesh',MeshCore.validateMesh(p.positions,p.indices));
  const options={heightmap:new Float32Array(400).fill(1),rows:20,cols:20,designWidth:28,designHeight:28,designY:44.5,maxHeight:.8};
  for(const designAngle of [0,90,180,-90])for(const negative of [false,true]){
    const m=SleeveTemplate.build(p,{...options,designAngle,negative});const v=MeshCore.validateMesh(m.positions,m.indices);console.log(quality,{designAngle,negative,info:m.info,validation:v});assert.equal(v.boundary+v.nonManifold+v.zeroArea,0);
    let tested=0,untouched=0;for(let i=0;i<m.amplitude.length;i++){const delta=[0,1,2].map(a=>m.positions[i*3+a]-p.positions[i*3+a]);if(m.amplitude[i]>.99){const along=delta.reduce((s,x,a)=>s+x*p.normals[i*3+a],0);assert(Math.abs(along-(negative?-1:1)*.8*m.amplitude[i])<.00002);assert(Math.abs(Math.hypot(...delta)-.8*m.amplitude[i])<.00002);tested++}if(!p.outer[i]||p.distance[i]===0){assert(delta.every(x=>x===0));untouched++}}assert(tested>0);assert(untouched>0);
  }
  console.timeEnd(quality);
}
console.log('Template normal depth and cavity preservation checks passed.');
