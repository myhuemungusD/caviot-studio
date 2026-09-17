import fs from 'node:fs';import zlib from 'node:zlib';import assert from 'node:assert/strict';globalThis.window=globalThis;
for(const f of ['mesh-core','template-core','template-sharp','mesh-repair','project-format'])await import('./dist/'+f+'.js');
const raw=zlib.gunzipSync(fs.readFileSync(new URL('./dist/templates/ETSYFOLGER-preview.mesh',import.meta.url)));const p=SleeveTemplate.decode(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const rows=128,cols=128,a=new Float32Array(rows*cols),b=new Float32Array(rows*cols);for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){a[y*cols+x]=(x>30&&x<95&&y>25&&y<100)?1:0;b[y*cols+x]=Math.abs(Math.hypot(x-64,y-64)-30)<9?1:0;}
const front={heightmap:a,rows,cols,designWidth:20,designHeight:24,designAngle:0,designY:45,designRotation:0},back={...front,heightmap:b,designAngle:180,designWidth:16,designHeight:28,designY:46};
for(const [negative,designs]of [[false,[front,back]],[true,[front,{...back,heightmap:a}]],[false,[front,{...front,designY:47}]]]){
 const o={designs,maxHeight:.6,negative,sharpSpacing:.24};console.time('two sides');const mesh=SharpSleeve.build(p,o),check=MeshRepair.repair(mesh.positions,mesh.indices).report;assert(check.closed);assert.equal(check.removed,0);assert(mesh.info.affectedByDesign.every(n=>n>0));for(let i=0;i<p.positions.length;i++)assert.equal(mesh.positions[i],p.positions[i]);console.log({negative,affected:mesh.info.affectedByDesign,triangles:check.triCount,closed:check.closed});console.timeEnd('two sides');
}
const smooth=SleeveTemplate.build(p,{designs:[front,back],maxHeight:.6,negative:false});assert(smooth.info.affectedByDesign.every(n=>n>0));assert.equal(MeshCore.validateMesh(smooth.positions,smooth.indices).boundary,0);
console.log('Both sides, different artwork, shared artwork, overlap union, deboss and scalar relief passed.');
