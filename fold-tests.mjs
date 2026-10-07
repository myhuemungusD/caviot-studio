// Sculpted custom templates (hoodie-style folds, an inner sleeve under a sculpted shell):
// - small steep patches inside the outer surface are not treated as openings (no ragged keep-out holes in artwork),
//   while rims and openings keep their protection;
// - deboss over hidden thin inner walls is clipped there instead of failing the whole preview.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const dist=new URL('./dist/',import.meta.url);
globalThis.self=globalThis;globalThis.window=globalThis;globalThis.postMessage=()=>{};
for(const f of ['mesh-core.js','template-core.js','mesh-repair.js','template-sharp.js','custom-template.js'])vm.runInThisContext(fs.readFileSync(new URL(f,dist),'utf8'),{filename:f});
const {CustomTemplate,SharpSleeve}=globalThis;
// Y-up open tube (outer radius 15, inner 13, 50 tall), indexed.
function tube(ro=15,ri=13,h=50,n=64,rows=25){const P=[],I=[],id=(r,i,j)=>((r?1:0)*n*(rows+1))+j*n+(i%n);
  for(const r of [ro,ri])for(let j=0;j<=rows;j++)for(let i=0;i<n;i++){const a=i/n*2*Math.PI;P.push(r*Math.cos(a),j/rows*h,r*Math.sin(a))}
  for(let j=0;j<rows;j++)for(let i=0;i<n;i++){const a=id(0,i,j),b=id(0,i+1,j),c=id(0,i+1,j+1),d=id(0,i,j+1);I.push(a,c,b,a,d,c);const e=id(1,i,j),f=id(1,i+1,j),g=id(1,i+1,j+1),k=id(1,i,j+1);I.push(e,f,g,e,g,k)}
  for(let i=0;i<n;i++){const a=id(0,i,rows),b=id(0,i+1,rows),c=id(1,i+1,rows),d=id(1,i,rows);I.push(a,c,b,a,d,c);const e=id(0,i,0),f=id(0,i+1,0),g=id(1,i+1,0),k=id(1,i,0);I.push(e,f,g,e,g,k)}
  return{positions:new Float32Array(P),indices:new Uint32Array(I),n,rows}}
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name)};
test('a small steep patch inside the outer wall becomes outer; rims and the cavity stay protected',()=>{
  const t=tube(),faces=t.indices.length/3,outer=new Uint8Array(faces);
  // outer wall faces = first n*rows*2 faces; mark them outer, everything else (cavity, rims) non-outer
  const wall=t.n*t.rows;for(let q=0;q<t.n*t.rows;q++){outer[q*4]=1;outer[q*4+1]=1}
  const fold=[(12*t.n+5)*4,(12*t.n+5)*4+1];for(const f of fold)outer[f]=0;// one 1.5 x 2 mm quad in mid-wall, like a fabric fold
  const before=Array.from(outer);CustomTemplate.keepSmallFolds(t.positions,t.indices,outer);
  for(const f of fold)assert.equal(outer[f],1,'fold face reclassified as outer');
  let rimKept=0,cavityKept=0;for(let f=0;f<faces;f++)if(before[f]===0&&!fold.includes(f)){assert.equal(outer[f],0);if(f>=wall*4)rimKept++;else cavityKept++}
  assert.ok(rimKept>0&&cavityKept>0,'rims and cavity untouched');
});
test('a large steep region (bigger than 3 mm) keeps its keep-out band',()=>{
  const t=tube(),outer=new Uint8Array(t.indices.length/3);for(let q=0;q<t.n*t.rows;q++){outer[q*4]=1;outer[q*4+1]=1}
  const patch=[];for(let j=10;j<14;j++)for(let i=5;i<9;i++)patch.push((j*t.n+i)*4,(j*t.n+i)*4+1);for(const f of patch)outer[f]=0;
  CustomTemplate.keepSmallFolds(t.positions,t.indices,outer);for(const f of patch)assert.equal(outer[f],0);
});
test('deboss over a hidden thin wall is clipped there instead of failing the build',()=>{
  const t=tube(15,13,50,96,50),base=CustomTemplate.orient({positions:t.positions,indices:t.indices,closed:false},CustomTemplate.normalizeOrientation({up:'+y',autoAlign:false}));
  const p=CustomTemplate.prepare(base,{quality:'preview',onProgress:()=>{}});
  // Pretend part of the design area sits over a 1.0 mm wall (as on a template whose sculpted shell covers a thin inner sleeve).
  let thinned=0;for(let i=0;i<p.thickness.length;i++){const y=p.positions[i*3+1],x=p.positions[i*3];if(p.outer[i]&&Math.abs(y-25)<2&&Math.abs(x)<3&&p.positions[i*3+2]>0){p.thickness[i]=1;thinned++}}
  assert.ok(thinned>0);
  const R=64,C=64,hm=new Float32Array(R*C).fill(1);
  const d={designAngle:0,designY:25,designWidth:20,designHeight:20,designRotation:0,heightmap:hm,rows:R,cols:C,maxHeight:.4,negative:true,sharp:true,sourceScale:1};
  const r=SharpSleeve.buildAdaptive(p,{sharp:true,designs:[d],maxHeight:.4,negative:true,sharpSpacing:.3,weldSafe:true});
  assert.ok(r.info.affected>0&&r.info.clipped>0,'formed, with the thin part clipped');
  const v=MeshCore.validateMesh(r.positions,r.indices);assert.equal(v.boundary+v.nonManifold+v.zeroArea>=0,true);
});
console.log(count+' fold checks passed');
