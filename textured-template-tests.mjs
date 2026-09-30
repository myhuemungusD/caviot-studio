// Textured custom templates (bumps/discs over the whole outside, like the "circlesthin" sleeve):
// texture detection, raised emboss pads (closed, above the bumps, continuous), export checks, and the
// unchanged paths (plain templates, deboss, the option turned off). A synthetic sleeve stands in for
// the real 30 MB STL: 12.7 mm radius, 1.35 mm wall, 2.2 mm discs on a 3.6 mm hex pitch.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const dist=new URL('./dist/',import.meta.url);
let count=0;const test=async(name,fn)=>{const t=Date.now();await fn();count++;console.log('PASS '+name+' ('+(Date.now()-t)+' ms)')};
const replies=[];globalThis.self=globalThis;globalThis.postMessage=r=>replies.push(r);
globalThis.importScripts=(...files)=>{for(const f of files)vm.runInThisContext(fs.readFileSync(new URL(f,dist),'utf8'),{filename:f})};
vm.runInThisContext(fs.readFileSync(new URL('template-worker.js',dist),'utf8'),{filename:'template-worker.js'});
vm.runInThisContext(fs.readFileSync(new URL('project-format.js',dist),'utf8'),{filename:'project-format.js'});
const {CustomTemplate,MeshCore,ProjectFormat,SleeveTemplate}=globalThis;
async function worker(message){replies.length=0;await globalThis.onmessage({data:message});return replies.filter(r=>!r.progress)}

// Z-up sleeve: outer skin r(s,z)=R+bump(s,z) on a grid, plain inner wall, flat annular ends. Closed, outward winding.
function sleeve({R=12.7,RI=11.35,H=50,step=.4,discR=1.6,pitch=3.6,bumpH=2.2,edge=.3,band=3}={}){
  const per=2*Math.PI*R,nt=Math.round(per/step),nz=Math.round(H/step)+1,ncol=Math.round(per/pitch),px=per/ncol,py=pitch*Math.sqrt(3)/2;
  const bump=(s,z)=>{if(!bumpH||z<band||z>H-band)return 0;let best=1e9;const row=Math.round(z/py);for(let r=row-1;r<=row+1;r++){const off=(r&1)?px/2:0,c=Math.round((s-off)/px);for(let k=c-1;k<=c+1;k++){let dx=s-(k*px+off);dx-=Math.round(dx/per)*per;best=Math.min(best,Math.hypot(dx,z-r*py))}}const t=Math.max(0,Math.min(1,(discR-best)/edge));return bumpH*t*t*(3-2*t)};
  const P=[],T=[],vid=(i,j)=>j*nt+(i%nt);
  for(let j=0;j<nz;j++){const z=Math.min(H,j*step);for(let i=0;i<nt;i++){const a=i/nt*2*Math.PI,r=R+bump(i/nt*per,z);P.push([r*Math.cos(a),r*Math.sin(a),z])}}
  for(let j=0;j<nz-1;j++)for(let i=0;i<nt;i++){const a=vid(i,j),b=vid(i+1,j),c=vid(i+1,j+1),d=vid(i,j+1);T.push([a,b,c],[a,c,d])}
  const i0=P.length;for(const z of [0,H])for(let i=0;i<nt;i++){const a=i/nt*2*Math.PI;P.push([RI*Math.cos(a),RI*Math.sin(a),z])}
  const iv=(i,top)=>i0+(top?nt:0)+(i%nt);
  for(let i=0;i<nt;i++){T.push([iv(i,0),iv(i+1,1),iv(i+1,0)],[iv(i,0),iv(i,1),iv(i+1,1)],[iv(i,0),iv(i+1,0),vid(i+1,0)],[iv(i,0),vid(i+1,0),vid(i,0)],[iv(i,1),vid(i+1,nz-1),iv(i+1,1)],[iv(i,1),vid(i,nz-1),vid(i+1,nz-1)])}
  const buf=Buffer.alloc(84+T.length*50);buf.writeUInt32LE(T.length,80);T.forEach((t,f)=>t.forEach((v,k)=>{for(let q=0;q<3;q++)buf.writeFloatLE(P[v][q],84+f*50+12+k*12+q*4)}));
  return buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
}
async function prepare(buffer){const r=await worker({type:'custom-prepare',id:1,buffer,orientation:{}});const ready=r.find(m=>m.stage==='ready'),print=r.find(m=>m.stage==='print');assert(ready&&print,'prepare failed: '+JSON.stringify(r.find(m=>m.error)));return{ready,preview:ready.preview,print:print.print}}
const bumpy=await prepare(sleeve()),plain=await prepare(sleeve({bumpH:0}));

// Line art: a 0.9 mm outline rectangle with a diagonal, 30 × 24 mm - thin strokes that cross many discs.
const rows=120,cols=150,art=new Float32Array(rows*cols);
for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const u=x/(cols-1)*30,v=y/(rows-1)*24,edge=Math.min(u,30-u,v,24-v),diag=Math.abs(v-u*24/30)*30/Math.hypot(30,24);art[y*cols+x]=edge>1&&edge<1.9||diag<.45&&edge>1?1:0}
const design=extra=>({heightmap:art,rows,cols,designWidth:30,designHeight:24,designAngle:0,designY:25,designRotation:0,maxHeight:.4,negative:false,sharp:true,...extra});
const job=(type,prepared,designs,extra={})=>({type,id:2,format:'stl',options:{sharp:true,maxHeight:.4,designs},template:{kind:'custom',key:'k'+Math.random(),prepared,...extra}});
// Connected components of faces (shared vertices), for the continuity checks.
function components(indices,keep=()=>true){const parent=new Map(),find=x=>{while(parent.get(x)!==x){parent.set(x,parent.get(parent.get(x)));x=parent.get(x)}return x};
  for(let f=0;f<indices.length/3;f++){if(!keep(f))continue;const [a,b,c]=[indices[f*3],indices[f*3+1],indices[f*3+2]];for(const v of [a,b,c])if(!parent.has(v))parent.set(v,v);parent.set(find(a),find(b));parent.set(find(b),find(c))}
  return new Set([...parent.keys()].map(find)).size}

await test('texture detection: bumpy sleeve is textured (depth about 2.2 mm, envelope perimeter), a plain sleeve is not',()=>{
  for(const p of [bumpy.preview,bumpy.print]){assert(p.texture.textured);assert(Math.abs(p.texture.depth-2.2)<.4,'depth '+p.texture.depth)}
  for(const p of [plain.preview,plain.print]){assert(!p.texture.textured);assert(p.texture.depth<.2,'plain depth '+p.texture.depth)}
  // Placement is measured along the smooth envelope over the discs, not the zigzag outline (which is ~1.7× longer).
  assert(Math.abs(bumpy.print.chart.perimeter-2*Math.PI*14.9)<1.5,'bumpy perimeter '+bumpy.print.chart.perimeter);assert(bumpy.print.chart.textured);
  assert(Math.abs(plain.print.chart.perimeter-2*Math.PI*12.7)<.2);assert(!plain.print.chart.textured);
});
await test('pad field: top clears every bump, bottom is embedded but above the cavity',()=>{
  const p=bumpy.print,t=p.texture,sample=(f,s,y)=>{const gx=(((s/t.cell-.5)%t.cols)+t.cols)%t.cols,gy=Math.max(0,Math.min(t.rows-1,y/t.cell-.5)),x0=Math.floor(gx),y0=Math.floor(gy),x1=(x0+1)%t.cols,y1=Math.min(t.rows-1,y0+1),fx=gx-x0,fy=gy-y0;return (f[y0*t.cols+x0]*(1-fx)+f[y0*t.cols+x1]*fx)*(1-fy)+(f[y1*t.cols+x0]*(1-fx)+f[y1*t.cols+x1]*fx)*fy};
  let n=0;for(let i=0;i<p.uv.length;i++){const y=p.positions[i*3+1];if(!p.outer[i]||sample(t.valid,p.uv[i],y)<1.2)continue;const r=Math.hypot(p.positions[i*3],p.positions[i*3+2]);n++;
    assert(r<=sample(t.top,p.uv[i],y)+.01,'bump above pad top');assert(r>=sample(t.bottom,p.uv[i],y)-.01,'pad bottom above skin');}
  assert(n>1000);for(let k=0;k<t.bottom.length;k++)if(t.valid[k]>1.2)assert(t.bottom[k]>11.35+.2,'pad bottom reaches the cavity');
});
await test('raised pads are one closed shell per connected design, draped relief is fragmented',async()=>{
  const pads=CustomTemplate.buildTexturePads(bumpy.print,[design()],{spacing:.14});
  assert.deepEqual(MeshCore.validateMesh(pads.positions,pads.indices),{triCount:pads.indices.length/3,zeroArea:0,boundary:0,nonManifold:0});
  assert.equal(components(pads.indices),1);assert(pads.counts[0]>1000);
  // Old behaviour (option off): the artwork survives only on disc interiors - scattered islands, or nothing at all.
  const [off]=await worker(job('preview',bumpy.preview,[design()],{raiseOnTexture:false}));assert(!off.info.raised);
  const islands=components(off.indices,f=>off.amplitude[off.indices[f*3]]>0&&off.amplitude[off.indices[f*3+1]]>0&&off.amplitude[off.indices[f*3+2]]>0);assert(off.info.affected===0||islands>10,'draped islands '+islands);
  const [on]=await worker(job('preview',bumpy.preview,[design()]));assert.equal(on.info.raised,1);assert(on.info.affectedByDesign[0]>0);assert(on.walls.length>0);
});
await test('export: raised design passes the mesh check and re-imports closed, Z-up, relief 0.4 mm above the bumps',async()=>{
  const [r]=await worker(job('export',bumpy.print,[design()]));assert(!r.error,r.error);assert.equal(r.info.raised,1);
  assert.equal(r.validation.boundary+r.validation.nonManifold+r.validation.zeroArea,0);
  const back=CustomTemplate.load(r.buffer);assert(back.report.closed,JSON.stringify(back.report));
  let top=0;const p=back.source.positions;for(let i=0;i<p.length;i+=3)top=Math.max(top,Math.hypot(p[i],p[i+1]));assert(Math.abs(top-(12.7+2.2+.4))<.05,'outermost radius '+top);
});
await test('multiple sides and deboss: emboss sides are raised, deboss is reported clearly',async()=>{
  const back=design({designAngle:180}),deboss=design({designAngle:90,negative:true,maxHeight:.3,sharp:false});
  const [r]=await worker(job('preview',bumpy.preview,[design(),deboss,back]));assert(!r.error,r.error);assert.equal(r.info.raised,2);assert.equal(r.info.affectedByDesign.length,3);
  assert(r.info.affectedByDesign[0]>0&&r.info.affectedByDesign[2]>0);assert.equal(r.info.affectedByDesign[1],0);assert.equal(r.info.textureDeboss,1);
  // Deboss is not raised; it cannot be cut into the bumps, and export explains that instead of a placement error.
  const [d]=await worker(job('preview',bumpy.preview,[deboss]));assert(!d.info.raised);
  const [e]=await worker(job('export',bumpy.print,[design(),deboss]));assert.match(e.error,/Deboss cannot be cut into this template's textured surface/);
  const plainJob=job('export',plain.print,[deboss]);plainJob.options.sharp=false;const [plainDeboss]=await worker(plainJob);assert(!plainDeboss.error,plainDeboss.error);assert(!plainDeboss.info.textureDeboss);
  // A design placed entirely on the rim keep-out is reported as missing, like any off-surface design.
  const [miss]=await worker(job('export',bumpy.print,[design({designY:50,designHeight:2,designWidth:4})]));assert.match(miss.error,/not on a printable surface|no artwork/);
});
await test('smooth (non-sharp) emboss is raised too and stays closed',async()=>{
  const soft=Float32Array.from(art,v=>v*.6);const [r]=await worker({...job('export',bumpy.print,[design({heightmap:soft,sharp:false})]),options:{sharp:false,maxHeight:.4,designs:[design({heightmap:soft,sharp:false})]}});
  assert(!r.error,r.error);assert.equal(r.info.raised,1);assert.equal(r.validation.boundary+r.validation.nonManifold,0);
});
await test('plain templates and option off keep the normal builder output exactly',async()=>{
  const opts=[design()];const a=await worker(job('preview',plain.preview,opts)),b=await worker(job('preview',plain.preview,opts,{raiseOnTexture:false}));
  assert(!a[0].info.raised);assert.deepEqual(Array.from(a[0].positions),Array.from(b[0].positions));assert.deepEqual(Array.from(a[0].indices),Array.from(b[0].indices));
});
await test('the option persists: orientation default, project format 4 round trip, old files unchanged',()=>{
  assert.equal(CustomTemplate.normalizeOrientation({}).raiseOnTexture,true);assert.equal(CustomTemplate.normalizeOrientation({raiseOnTexture:false}).raiseOnTexture,false);
  const o={up:'auto',turn:0,units:'mm',autoAlign:true},p=o2=>({format:'icaviot-project',version:4,name:'x',source:'x',settings:{templateId:'custom-stl'},image:null,layers:[[],[]],activeSide:0,linkSides:false,selectedIds:[null,null],template:{kind:'custom-stl',name:'bumpy',triangles:12,repaired:false,orientation:o2,mesh:null}});
  assert.equal(ProjectFormat.decode(JSON.stringify(p({...o,raiseOnTexture:false}))).template.orientation.raiseOnTexture,false);
  assert.deepEqual(ProjectFormat.decode(JSON.stringify(p(o))).template.orientation,o);
  assert.throws(()=>ProjectFormat.decode(JSON.stringify(p({...o,raiseOnTexture:'yes'}))),/orientation/);
});
await test('toThreeGeometry wraps typed index arrays (custom templates) and keeps plain arrays',()=>{
  class BufferAttribute{constructor(array,itemSize){this.array=array;this.itemSize=itemSize}}
  class BufferGeometry{setAttribute(){}setIndex(i){this.index=Array.isArray(i)?new BufferAttribute(new Uint32Array(i),1):i}computeVertexNormals(){}}
  const THREE={BufferGeometry,BufferAttribute},typed=MeshCore.toThreeGeometry({positions:new Float32Array(9),indices:new Uint32Array([0,1,2])},THREE),plainGeo=MeshCore.toThreeGeometry({positions:new Float32Array(9),indices:[0,1,2]},THREE);
  assert(typed.index instanceof BufferAttribute&&typed.index.itemSize===1);assert(plainGeo.index instanceof BufferAttribute);
});
console.log(count+' textured template checks passed');
