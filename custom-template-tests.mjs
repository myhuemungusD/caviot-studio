// Custom STL template pipeline: parse (binary + ASCII), weld, orientation, preparation,
// worker preview/export with emboss/deboss, manifold checks and project format 4.
import fs from 'node:fs';import vm from 'node:vm';import zlib from 'node:zlib';import assert from 'node:assert/strict';
const dist=new URL('./dist/',import.meta.url);
let count=0;const test=async(name,fn)=>{const t=Date.now();await fn();count++;console.log('PASS '+name+' ('+(Date.now()-t)+' ms)')};

// ---------- Worker in a sandbox, same scripts as the browser ----------
// vm.runInThisContext keeps browser-like global script semantics without slow contextified globals.
const replies=[];globalThis.self=globalThis;globalThis.postMessage=r=>replies.push(r);
globalThis.importScripts=(...files)=>{for(const f of files)vm.runInThisContext(fs.readFileSync(new URL(f,dist),'utf8'),{filename:f})};
vm.runInThisContext(fs.readFileSync(new URL('template-worker.js',dist),'utf8'),{filename:'template-worker.js'});
vm.runInThisContext(fs.readFileSync(new URL('project-format.js',dist),'utf8'),{filename:'project-format.js'});
const ctx=globalThis,{CustomTemplate,MeshCore,ProjectFormat,SharpSleeve}=globalThis;
async function worker(message){replies.length=0;await ctx.onmessage({data:message});return replies.filter(r=>!r.progress)}

// ---------- Generated meshes ----------
function binarySTL(tris){const buf=Buffer.alloc(84+tris.length*50);buf.writeUInt32LE(tris.length,80);tris.forEach((t,f)=>t.flat().forEach((v,k)=>buf.writeFloatLE(v,84+f*50+12+k*4)));return buf}
function asciiSTL(tris){return Buffer.from('solid generated\n'+tris.map(t=>' facet normal 0 0 0\n  outer loop\n'+t.map(p=>'   vertex '+p.map(v=>v.toExponential(6)).join(' ')).join('\n')+'\n  endloop\n endfacet').join('\n')+'\nendsolid generated\n')}
// Z-up box, outward winding.
function box(sx,sy,sz){const v=[[0,0,0],[sx,0,0],[sx,sy,0],[0,sy,0],[0,0,sz],[sx,0,sz],[sx,sy,sz],[0,sy,sz]],q=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],t=[];for(const [a,b,c,d]of q)t.push([v[a],v[b],v[c]],[v[a],v[c],v[d]]);return t}
// Z-up hollow tube (a simple sleeve with an open cavity), outward winding; bottom>0 closes it with a floor of that thickness.
function tube(ro,ri,h,n=64,bottom=0){const t=[],P=(r,i,z)=>[r*Math.cos(i/n*2*Math.PI),r*Math.sin(i/n*2*Math.PI),z];for(let i=0;i<n;i++){const j=i+1;
  t.push([P(ro,i,0),P(ro,j,0),P(ro,j,h)],[P(ro,i,0),P(ro,j,h),P(ro,i,h)]);t.push([P(ri,i,bottom),P(ri,j,h),P(ri,j,bottom)],[P(ri,i,bottom),P(ri,i,h),P(ri,j,h)]);
  t.push([P(ri,i,h),P(ro,i,h),P(ro,j,h)],[P(ri,i,h),P(ro,j,h),P(ri,j,h)]);
  if(bottom)t.push([[0,0,0],P(ro,j,0),P(ro,i,0)],[[0,0,bottom],P(ri,i,bottom),P(ri,j,bottom)]);else t.push([P(ri,i,0),P(ro,j,0),P(ro,i,0)],[P(ri,i,0),P(ri,j,0),P(ro,j,0)])}return t}
// Box with each face split into an n×n grid (small triangles, so a missing one is a "tiny hole").
function gridBox(size,n){const t=[],faces=[[[0,0,0],[0,1,0],[1,0,0]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,0],[1,0,0],[0,0,1]],[[1,0,0],[0,1,0],[0,0,1]],[[1,1,0],[-1,0,0],[0,0,1]],[[0,1,0],[0,-1,0],[0,0,1]]];
  for(const [o,u,v]of faces)for(let i=0;i<n;i++)for(let j=0;j<n;j++){const P=(a,b)=>[0,1,2].map(k=>(o[k]+u[k]*a/n+v[k]*b/n)*size);t.push([P(i,j),P(i+1,j),P(i+1,j+1)],[P(i,j),P(i+1,j+1),P(i,j+1)])}return t}
const flip=tris=>tris.map(([a,b,c])=>[a,c,b]);
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);

// Artwork: a filled square and the Design Mainline mask from test-fixtures.
const rows=96,cols=96,square=new Float32Array(rows*cols);for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)square[y*cols+x]=x>12&&x<84&&y>12&&y<84?1:0;
const logoRaw=zlib.gunzipSync(fs.readFileSync(new URL('./test-fixtures/bottom-logo-mask.f32.gz',import.meta.url))),logo=new Float32Array(ab(logoRaw));
const design=(extra)=>({heightmap:square,rows,cols,designWidth:12,designHeight:12,designAngle:0,designRotation:0,maxHeight:.6,negative:false,sharp:true,...extra});

await test('binary and ASCII parsing agree',()=>{
  const tris=box(20,10,30),b=CustomTemplate.parseSTL(binarySTL(tris)),a=CustomTemplate.parseSTL(asciiSTL(tris));
  assert.equal(b.format,'binary');assert.equal(a.format,'ascii');assert.equal(b.triangles,12);assert.equal(a.triangles,12);for(let i=0;i<b.soup.length;i++)assert(Math.abs(a.soup[i]-b.soup[i])<1e-4);
});
await test('bad files give clear errors',()=>{
  assert.throws(()=>CustomTemplate.parseSTL(new ArrayBuffer(0)),/empty/);
  assert.throws(()=>CustomTemplate.parseSTL(Buffer.from('hello world, definitely not an stl file with enough bytes to look binary maybe........................')),/not a valid STL/);
  const truncated=binarySTL(box(1,1,1)).subarray(0,300);assert.throws(()=>CustomTemplate.parseSTL(truncated),/truncated/);
  assert.throws(()=>CustomTemplate.parseSTL(Buffer.from('solid x\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nendloop\nendfacet\nendsolid')),/truncated/);
  assert.throws(()=>CustomTemplate.parseSTL(Buffer.from('solid x\nendsolid x\n')),/no triangles/);
  const nan=binarySTL(box(1,1,1));nan.writeFloatLE(NaN,84+12);assert.throws(()=>CustomTemplate.parseSTL(nan),/invalid/i);
});
await test('binary quirks: "solid" header, trailing padding, chunked ASCII',()=>{
  const bin=binarySTL(box(20,10,30));Buffer.from('solid exported by some CAD tool').copy(bin,0);
  const h=CustomTemplate.parseSTL(bin);assert.equal(h.format,'binary');assert.equal(h.triangles,12);
  const padded=Buffer.concat([binarySTL(box(20,10,30)),Buffer.alloc(3)]);assert.equal(CustomTemplate.parseSTL(padded).triangles,12);
  // A short (truncated) binary file is rejected even when a big padding tolerance would otherwise apply.
  assert.throws(()=>CustomTemplate.parseSTL(binarySTL(box(20,10,30)).subarray(0,84+11*50)),/truncated: it declares 12 triangles but only 11/);
  assert.throws(()=>CustomTemplate.parseSTL(bin.subarray(0,84+11*50)),/truncated/,'a truncated binary with a "solid" header is not mistaken for ASCII');
  // ASCII larger than one 8 MB parse chunk: facets crossing chunk borders are not lost.
  const many=gridBox(50,70),big=asciiSTL(many);assert(big.length>8*1024*1024,'fixture spans chunks');
  const a=CustomTemplate.parseSTL(big);assert.equal(a.triangles,many.length);assert.equal(a.soup.length,many.length*9);
  const b=CustomTemplate.parseSTL(binarySTL(many));for(let i=0;i<b.soup.length;i+=997)assert(Math.abs(a.soup[i]-b.soup[i])<1e-3);
});
await test('weld, inverted normals and open meshes are reported',()=>{
  const inverted=CustomTemplate.load(asciiSTL(flip(tube(15,12,40))));assert(inverted.report.inverted);assert(inverted.report.closed);assert(inverted.report.volume>0);
  const mixed=box(10,10,10);mixed[3]=[mixed[3][0],mixed[3][2],mixed[3][1]];const m=CustomTemplate.load(binarySTL(mixed));assert.equal(m.report.flippedFaces,1);assert(m.report.closed);
  const open=CustomTemplate.load(binarySTL(box(10,10,10).slice(0,11)));assert.equal(open.report.closed,false);assert.equal(open.report.boundary,3);assert.match(CustomTemplate.describeProblems(open.report)[0],/3 open edges/);
  const holed=gridBox(10,8);holed.splice(40,1);const repaired=CustomTemplate.load(binarySTL(holed),{repair:true});assert(repaired.report.closed,'Make watertight closes one missing triangle');
});
await test('orientation: auto up, flips, quarter turns, units',()=>{
  const src=CustomTemplate.load(binarySTL(box(60,20,10))).source;
  const auto=CustomTemplate.orient(src,{up:'auto'});assert.equal(auto.orientation.resolvedUp,'+x');assert(Math.abs(auto.height-60)<1e-4);
  const z=CustomTemplate.orient(src,{up:'+z',autoAlign:true});assert(Math.abs(z.height-10)<1e-4);const w=z.bounds.max[0]-z.bounds.min[0],d=z.bounds.max[2]-z.bounds.min[2];assert(Math.abs(w-60)<1e-3&&Math.abs(d-20)<1e-3,'widest side faces front');
  const turned=CustomTemplate.orient(src,{up:'+z',turn:90});assert(Math.abs(turned.bounds.max[0]-turned.bounds.min[0]-20)<1e-3);
  const cm=CustomTemplate.orient(src,{up:'-z',units:'cm'});assert(Math.abs(cm.height-100)<1e-3);assert(Math.abs(cm.bounds.min[1])<1e-6);
  // Widest-side alignment is exact for a 96-gon disc on edge (unbiased by fan triangles) and leaves round outlines unrotated.
  const disc=[],R=45,N=96,Q=i=>[R*Math.cos(i/N*2*Math.PI),R*Math.sin(i/N*2*Math.PI)];for(let i=0;i<N;i++){const [x0,y0]=Q(i),[x1,y1]=Q(i+1);disc.push([[x0,y0,0],[x1,y1,0],[x1,y1,4]],[[x0,y0,0],[x1,y1,4],[x0,y0,4]],[[0,0,4],[x0,y0,4],[x1,y1,4]],[[0,0,0],[x1,y1,0],[x0,y0,0]])}
  const standing=CustomTemplate.orient(CustomTemplate.load(binarySTL(disc)).source,{});assert(Math.abs(standing.bounds.max[2]-standing.bounds.min[2]-4)<1e-3,'disc faces the front squarely');
  const round=CustomTemplate.orient(CustomTemplate.load(binarySTL(tube(17,13.5,60,96))).source,{up:'+z'});assert(Math.abs(round.bounds.max[0]-round.bounds.min[0]-34)<1e-4,'round outline keeps the file rotation');
  // Proper rotations keep outward winding.
  for(const up of ['+z','-z','+y','-y','+x','-x'])assert(CustomTemplate.signedVolume(CustomTemplate.orient(src,{up}).positions,src.indices)>0,up);
});
await test('decimated preview copy stays within budget',()=>{
  const base=CustomTemplate.orient(CustomTemplate.load(binarySTL(tube(15,12,40,400))).source,{});const d=CustomTemplate.decimate(base,600);assert(d.decimated);assert(d.indices.length/3<=690);assert.equal(CustomTemplate.decimate(base,1e6),base);
});

await test('dense meshes: coarser retries, then unrefined fallback, never a hard failure',()=>{
  const base=CustomTemplate.orient(CustomTemplate.load(binarySTL(tube(15,12,40,64))).source,{});const msgs=[];
  const p=CustomTemplate.prepare(base,{spacing:.3,maxPoints:base.positions.length/3+2000,onProgress:m=>msgs.push(m)});
  assert(msgs.some(m=>/retrying/.test(m)),'backs off to a coarser spacing');assert(p.stats.vertices<=base.positions.length/3+2000||p.spacing===Infinity);
  const tiny=CustomTemplate.prepare(base,{spacing:.3,maxPoints:10,onProgress:m=>msgs.push(m)});assert.equal(tiny.spacing,Infinity);assert(msgs.some(m=>/without refinement/.test(m)));
  // Long slivers on the side, big fan triangles on the caps: when full refinement cannot fit, only the caps are refined.
  const cyl=[],CP=(i,z)=>[10*Math.cos(i/400*2*Math.PI),10*Math.sin(i/400*2*Math.PI),z];for(let i=0;i<400;i++){const j=(i+1)%400;for(let k=0;k<10;k++)cyl.push([CP(i,k*2),CP(j,k*2),CP(j,k*2+2)],[CP(i,k*2),CP(j,k*2+2),CP(i,k*2+2)]);cyl.push([[0,0,0],CP(j,0),CP(i,0)],[[0,0,20],CP(i,20),CP(j,20)])}
  const slivers=CustomTemplate.orient(CustomTemplate.load(binarySTL(cyl)).source,{up:'+z'}),V=slivers.positions.length/3;
  for(const maxPoints of [V+2000,Math.ceil(V/.95)]){const g=CustomTemplate.prepare(slivers,{spacing:.5,maxPoints});let bottom=0;for(let i=0;i<g.stats.vertices;i++)if(g.outer[i]&&g.positions[i*3+1]<1e-3&&g.distance[i]>1.2)bottom++;
    assert(Number.isFinite(g.spacing)&&g.stats.vertices<=maxPoints,'area-gated refinement fits the budget');assert(bottom>100,'the bottom cap gets interior vertices for relief (unrefined it has 1): '+bottom)}
  assert.equal(tiny.indices.length,base.indices.length);const v=MeshCore.validateMesh(tiny.positions,tiny.indices);assert.equal(v.boundary+v.nonManifold,0);
});
await test('wall-thickness rays capped at 4 mm on closed meshes give the same relief limits',()=>{
  const base=CustomTemplate.orient(CustomTemplate.load(binarySTL(tube(16,10,40,48))).source,{});assert(base.closed);
  const capped=CustomTemplate.prepare(base,{spacing:2}),full=CustomTemplate.prepare({...base,closed:false},{spacing:2});
  let far=0;for(let i=0;i<full.thickness.length;i++){if(full.thickness[i]<4)assert(Math.abs(capped.thickness[i]-full.thickness[i])<1e-6);else{assert.equal(capped.thickness[i],4);far++}}
  assert(far>0,'some rays hit farther than the cap (6 mm wall)');assert.equal(capped.stats.thinVertices,full.stats.thinVertices);
});

const templates=[
  ['generated cube (binary, 30 mm)',binarySTL(box(30,30,30)),{up:'+z'},[design({designY:15}),design({designY:15,designAngle:180,heightmap:logo,rows:logo.length/1024,cols:1024,designWidth:20,designHeight:15})]],
  ['generated tube sleeve (ASCII, inverted winding)',asciiSTL(flip(tube(16,12.5,50))),{up:'auto'},[design({designY:25}),design({designY:25,designAngle:180})]],
  ['ETSYFOLGER.stl loaded as a custom template',fs.readFileSync(new URL('templates/ETSYFOLGER.stl',dist)),{},[design({designY:44.5,designWidth:20,designHeight:20}),design({designY:40,designAngle:180,heightmap:logo,rows:logo.length/1024,cols:1024,designWidth:22,designHeight:16.45})]],
];
for(const [name,bytes,orientation,designs]of templates){
  let ready,print,key='t-'+count;
  await test(name+': load and prepare in worker',async()=>{
    const out=await worker({type:'custom-prepare',id:1,buffer:ab(bytes),orientation});assert(!out.find(r=>r.error),out.find(r=>r.error)?.error);
    ready=out.find(r=>r.stage==='ready');print=out.find(r=>r.stage==='print').print;assert(ready.report.closed,'template is closed');
    const v=MeshCore.validateMesh(print.positions,print.indices);assert.equal(v.boundary+v.nonManifold,0);assert(ready.preview.stats.outerVertices>0);
    assert.equal(print.chart.arc.length,721);assert(print.spacing>=.5&&ready.preview.spacing>=1.1);
    console.log('   ',{triangles:ready.report.triangles,height:+ready.base.height.toFixed(2),preview:ready.preview.stats.triangles,print:print.stats.triangles,spacing:+print.spacing.toFixed(3)});
  });
  await test(name+': front/back placement preview',async()=>{
    const out=await worker({id:2,type:'preview',template:{kind:'custom',key,prepared:ready.preview},options:{designs,maxHeight:.6,negative:false,sharp:false}});const r=out[0];assert(!r.error,r.error);
    assert(r.info.affectedByDesign.every(n=>n>0),'both designs land on the surface: '+r.info.affectedByDesign);
    const p=ready.preview;let moved=0,kept=0;for(let i=0;i<r.amplitude.length;i++){const d=Math.hypot(r.positions[i*3]-p.positions[i*3],r.positions[i*3+1]-p.positions[i*3+1],r.positions[i*3+2]-p.positions[i*3+2]);if(r.amplitude[i]>.99){assert(Math.abs(d-.6*r.amplitude[i])<1e-4);moved++}if(!p.outer[i]||p.distance[i]===0){assert.equal(d,0);kept++}}assert(moved>0&&kept>0);
    const cached=await worker({id:3,type:'preview',template:{kind:'custom',key},options:{designs,maxHeight:.6,negative:false,sharp:false}});assert(!cached[0].error,'worker caches the prepared template');
  });
  for(const negative of [false,true])for(const sharp of [true,false])await test(name+': '+(negative?'deboss':'emboss')+(sharp?' sharp':' smooth')+' STL export is manifold',async()=>{
    const out=await worker({id:4,type:'export',format:'stl',template:{kind:'custom',key,prepared:print},options:{designs:designs.map(d=>({...d,negative,sharp,maxHeight:.5})),maxHeight:.5,negative,sharp}});const r=out[0];assert(!r.error,r.error);
    const back=CustomTemplate.load(r.buffer);assert(back.report.closed,'exported STL re-imports closed: '+JSON.stringify(back.report));assert.equal(back.report.degenerate,0,'no faces fold when re-imported with 1e-5 mm welding');assert.equal(back.report.nonOrientable,0);assert.equal(back.report.flippedFaces,0);assert(!back.report.inverted);
    assert.equal(r.validation.boundary+r.validation.nonManifold+r.validation.zeroArea,0);
  });
  if(name.includes('cube'))await test(name+': background print preparation message',async()=>{const out=await worker({type:'custom-print',id:11,base:ready.base});assert(!out[0].error,out[0].error);assert.equal(out[0].stage,'print');assert.equal(out[0].print.indices.length,print.indices.length)});
  if(name.includes('cube'))await test(name+': export without a cached print surface prepares one from the base',async()=>{
    const out=await worker({id:5,type:'export',format:'obj',template:{kind:'custom',key:key+'-fresh',base:ready.base},options:{designs:designs.slice(0,1),maxHeight:.4,negative:false,sharp:true}});assert(!out[0].error,out[0].error);assert(out[0].text.startsWith('# iCaviot'));
  });
}
await test('flat CAD facets: collinear and sub-20 nm contour faces are cleaned so exports pass and re-import cleanly',async()=>{
  // Regression: a 96-sided tube (flat vertical facets) with this logo left one collinear face and failed the mesh check.
  const raw=zlib.gunzipSync(fs.readFileSync(new URL('./test-fixtures/design-mainline-square-mask.f32.gz',import.meta.url))),mask=new Float32Array(ab(raw));
  const out=await worker({type:'custom-prepare',id:12,buffer:ab(binarySTL(tube(16,12.5,50,96))),orientation:{},skipPrint:true});const base=out.find(r=>r.stage==='ready').base;
  const r=(await worker({id:13,type:'export',format:'stl',template:{kind:'custom',key:'facets',base},options:{designs:[design({heightmap:mask,rows:1024,cols:1024,designAngle:180,designY:25,designWidth:30,designHeight:30,maxHeight:.4,negative:true})],maxHeight:.4,negative:true,sharp:true}}))[0];
  assert(!r.error,r.error);assert(CustomTemplate.load(r.buffer).report.closed);
  // Regression: on a closed-bottom cup the same logo left edges under 1e-5 mm, which fold when a slicer welds vertices.
  const cup=(await worker({type:'custom-prepare',id:14,buffer:ab(binarySTL(tube(17,13.5,60,96,3))),orientation:{},skipPrint:true})).find(r=>r.stage==='ready').base;
  const r2=(await worker({id:15,type:'export',format:'stl',template:{kind:'custom',key:'cup',base:cup},options:{designs:[design({heightmap:mask,rows:1024,cols:1024,designAngle:180,designY:30,designWidth:30,designHeight:30,maxHeight:.4,negative:true})],maxHeight:.4,negative:true,sharp:true}}))[0];
  assert(!r2.error,r2.error);const back=CustomTemplate.load(r2.buffer).report;assert(back.closed);assert.equal(back.degenerate,0,'no sub-0.1 µm edges');
  // OBJ for custom templates keeps 6 decimals, so those slivers do not round to zero area.
  const obj=(await worker({id:16,type:'export',format:'obj',template:{kind:'custom',key:'cup'},options:{designs:[design({heightmap:mask,rows:1024,cols:1024,designAngle:180,designY:30,designWidth:30,designHeight:30,maxHeight:.4,negative:true})],maxHeight:.4,negative:true,sharp:true}}))[0].text;
  const OP=[],OI=[];for(const line of obj.split('\n')){const w=line.split(' ');if(w[0]==='v')OP.push(+w[1],+w[2],+w[3]);else if(w[0]==='f')OI.push(w[1]-1,w[2]-1,w[3]-1)}
  const a=CustomTemplate.analyze(new Float32Array(OP),new Uint32Array(OI));assert(a.closed,'OBJ closed: '+JSON.stringify(a));
  // Unit check: a collinear face next to a normal one is flipped into two valid faces covering the same area.
  const P=new Float32Array([0,0,0, 2,0,0, 1,0,0, 1,1,0]),tris=[0,1,2, 1,0,3];const flipped=SharpSleeve.flipCollinear(P,tris.slice(),new Set());
  assert.deepEqual(flipped,[2,0,3, 3,1,2]);assert.deepEqual(SharpSleeve.flipCollinear(P,[1,0,3],new Set()),[1,0,3],'valid faces are untouched');
});
await test('open template: clear export error; Make template watertight fixes it',async()=>{
  const holed=gridBox(30,24);holed.splice(10,1);const out=await worker({type:'custom-prepare',id:6,buffer:ab(binarySTL(holed)),orientation:{up:'+z'},skipPrint:true});const ready=out.find(r=>r.stage==='ready');assert.equal(ready.report.closed,false);assert.equal(ready.report.boundary,3);
  const o={designs:[design({designY:15})],maxHeight:.5,negative:false,sharp:true};
  const bad=await worker({id:7,type:'export',format:'stl',template:{kind:'custom',key:'open',base:ready.base},options:o});assert.match(bad[0].error,/open edges/);
  const rep=await worker({type:'custom-prepare',id:9,source:{positions:ready.source.positions,indices:ready.source.indices},report:ready.report,repair:true,orientation:{up:'+z'},skipPrint:true});const fixed=rep.find(r=>r.stage==='ready');assert(fixed.report.closed,'template repair closes the missing triangle');assert.equal(fixed.report.repairReport.filled,1);
  const good=await worker({id:8,type:'export',format:'stl',template:{kind:'custom',key:'fixed',base:fixed.base},options:o});assert(!good[0].error,good[0].error);assert(CustomTemplate.load(good[0].buffer).report.closed);
});
await test('sharp-edge budget errors on custom templates explain what helps',async()=>{
  const original=SharpSleeve.buildAdaptive;SharpSleeve.buildAdaptive=()=>{const e=Error('Artwork needs more mesh detail than this browser can hold.');e.code='MESH_BUDGET';throw e};
  try{const base=CustomTemplate.orient(CustomTemplate.load(binarySTL(box(30,30,30))).source,{up:'+z'});const out=await worker({id:17,type:'export',format:'stl',template:{kind:'custom',key:'budget',base},options:{designs:[design({designY:15})],maxHeight:.4,negative:false,sharp:true}});
    assert.match(out[0].error,/too dense for Sharp edges.*Turn off Sharp edges \(logos\)/)}finally{SharpSleeve.buildAdaptive=original}
});
await test('worker reports parse errors',async()=>{const out=await worker({type:'custom-prepare',id:10,buffer:ab(Buffer.from('solid x\nendsolid x\n')),orientation:{}});assert.match(out[0].error,/no triangles/)});

// ---------- Project format 4 ----------
const layer={id:'layer-1',kind:'image',image:'data:image/png;base64,AAAA',source:'Logo',fontChoice:'system',settings:{designAngle:0,designY:150,designWidth:40,designHeight:120,designRotation:0,bgR:255,bgG:255,bgB:255,bgTol:40,smoothPasses:0,letterSpacing:0,letterThickness:0,bgEnable:true,bgSoft:false,mirror:false,invert:true,depthMm:.4,relief:'raised',uniformDepth:true,crisp:true,text:''}};
const gz=zlib.gzipSync(binarySTL(box(30,30,200))).toString('base64');
const v4={format:'icaviot-project',version:4,name:'Custom',source:'Logo',settings:{templateId:'custom-stl'},image:null,layers:[[layer],[]],activeSide:0,linkSides:false,selectedIds:['layer-1',null],template:{kind:'custom-stl',name:'tall box',triangles:12,repaired:false,orientation:{up:'+z',turn:90,units:'mm',autoAlign:true},mesh:'data:application/gzip;base64,'+gz}};
await test('project format 4 embeds the template and allows tall placements',()=>{
  const p=ProjectFormat.decode(JSON.stringify(v4));assert.equal(p.template.name,'tall box');assert.equal(p.layers[0][0].settings.designY,150);
  const stl=zlib.gunzipSync(Buffer.from(p.template.mesh.split(',')[1],'base64'));assert(CustomTemplate.load(stl).report.closed);
  assert.equal(ProjectFormat.decode(JSON.stringify({...v4,template:{...v4.template,mesh:null}})).template.mesh,null);
  assert.equal(ProjectFormat.decode(JSON.stringify({...v4,template:null})).template,null);
});
await test('project format 4 rejects malformed templates; version 3 limits unchanged',()=>{
  for(const t of [{...v4.template,kind:'other'},{...v4.template,mesh:'https://example.com/x.stl'},{...v4.template,orientation:{...v4.template.orientation,turn:45}},{...v4.template,triangles:0},{...v4.template,name:5}])assert.throws(()=>ProjectFormat.decode(JSON.stringify({...v4,template:t})));
  assert.throws(()=>ProjectFormat.decode(JSON.stringify({...v4,version:3,template:undefined})),/Invalid side setting: designY/);
  const v3={...v4,version:3,template:undefined,layers:[[{...layer,settings:{...layer.settings,designY:44.5,designHeight:30}}],[]]};assert.equal(ProjectFormat.decode(JSON.stringify(v3)).version,3);
});
await test('browser scripts parse',()=>{for(const f of ['custom-template.js','custom-template-ui.js','template-worker.js','template-ui.js','product.js','project-format.js','design-sides.js','app-state.js','app.js'])new vm.Script(fs.readFileSync(new URL(f,dist),'utf8'),{filename:f})});
console.log(count+' custom template checks passed');
