import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const ctx={window:{},console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/mesh-core.js','utf8'),ctx);const mc=ctx.window.MeshCore;
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name)}
const rows=16,cols=24,hm=Float32Array.from({length:rows*cols},(_,i)=>(Math.sin(i*1.371)+1)/2);
const defaults={heightmap:hm,rows,cols,maxHeight:1.2,innerWidth:25.5,innerDepth:15.2,wall:2.4,sleeveHeight:40,width:40,base:1};
for(const mode of ['sleeve','logo-only','flat'])for(const negative of [false,true])for(const angle of [180,360]){
  test(`${mode} ${negative?'carved':'raised'} ${angle}`,()=>{
    const m=mc.buildMesh({...defaults,mode,negative,wrapAngle:angle});
    const v=mc.validateMesh(m.positions,m.indices);assert.equal(v.boundary,0);assert.equal(v.nonManifold,0);assert.equal(v.zeroArea,0);assert(m.positions.every(Number.isFinite));
    const buf=mc.exportSTL(m.positions,m.indices);assert.equal(buf.byteLength,84+50*v.triCount);assert.equal(new DataView(buf).getUint32(80,true),v.triCount);
    const obj=mc.exportOBJ(m.positions,m.indices);assert.equal(obj.split('\n').filter(x=>x.startsWith('f ')).length,v.triCount);
  });
}
for(const hole of [0,6])test('closed bottom, hole '+hole,()=>{const m=mc.buildMesh({...defaults,mode:'sleeve',wrapAngle:360,capBottom:true,capHole:hole,capThick:1.5});const v=mc.validateMesh(m.positions,m.indices);assert.equal(v.boundary+v.nonManifold+v.zeroArea,0)});
test('oversized bottom hole rejected',()=>assert.throws(()=>mc.buildMesh({...defaults,mode:'sleeve',wrapAngle:360,capBottom:true,capHole:20}),/smaller/));
test('fit ring is 5 mm tall',()=>{const m=mc.buildMesh({...defaults,mode:'sleeve',wrapAngle:360,sleeveHeight:5,maxHeight:0});const ys=Array.from(m.positions).filter((_,i)=>i%3===1);assert.equal(Math.max(...ys)-Math.min(...ys),5)});
test('resolution bounded',()=>{assert.equal(mc.getExportDetail(100000),400);assert.equal(mc.getExportDetail(-1),50);assert.equal(mc.getPreviewDetail(400,false),160)});
vm.runInContext(fs.readFileSync('dist/project-format.js','utf8'),ctx);
const valid={format:'icaviot-project',version:1,name:'Test',source:'Pattern',settings:{mode:'flat'},image:null};
test('project roundtrip',()=>assert.equal(ctx.ProjectFormat.decode(JSON.stringify(valid)).name,'Test'));
for(const [name,p] of [['version',{...valid,version:99}],['external image',{...valid,image:'https://example.com/image.png'}],['SVG',{...valid,image:'data:image/svg+xml;base64,PHN2Zz4='}],['settings',{...valid,settings:null}]])test('reject project '+name,()=>assert.throws(()=>ctx.ProjectFormat.decode(JSON.stringify(p))));
for(const file of ['mesh-core.js','app.js','product.js','project-format.js','export-worker.js','vendor/three.min.js','vendor/OrbitControls.js'])test('syntax '+file,()=>new vm.Script(fs.readFileSync('dist/'+file,'utf8'),{filename:file}));
for(const file of ['index.html','about.html'])test('local assets '+file,()=>{const html=fs.readFileSync('dist/'+file,'utf8');for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(/^(https?:|data:)/.test(m[1]))continue;assert(fs.existsSync('dist/'+m[1]),m[1])}const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size)});
let workerReply;
const workerContext={console,postMessage:r=>workerReply=r};workerContext.self=workerContext;
vm.createContext(workerContext);workerContext.importScripts=file=>vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),workerContext);
vm.runInContext(fs.readFileSync('dist/export-worker.js','utf8'),workerContext);
test('worker STL export',()=>{workerReply=null;workerContext.onmessage({data:{options:{...defaults,mode:'sleeve',wrapAngle:360},format:'stl'}});assert(!workerReply.error,workerReply.error);assert(workerReply.buffer.byteLength>84)});
test('worker OBJ export',()=>{workerContext.onmessage({data:{options:{...defaults,mode:'flat'},format:'obj'}});assert(!workerReply.error,workerReply.error);assert(workerReply.text.startsWith('# iCaviot'))});
test('worker rejects invalid geometry',()=>{workerContext.onmessage({data:{options:{...defaults,mode:'sleeve',capBottom:true,wrapAngle:360,capHole:20},format:'stl'}});assert.match(workerReply.error,/smaller/)});
console.log(`${count} checks passed`);
