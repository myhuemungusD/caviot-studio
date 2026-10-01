// Export path: speed work must not change a single byte, and "Make watertight" must never break a closed mesh.
import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const dist=new URL('./dist/',import.meta.url);
// 1. Mesh check and repair.
const ctx={window:{},console};vm.createContext(ctx);for(const f of ['mesh-core.js','mesh-repair.js'])vm.runInContext(fs.readFileSync(new URL(f,dist),'utf8'),ctx);ctx.MeshCore=ctx.window.MeshCore;
const {MeshCore,MeshRepair}=ctx.window;
const tetra=[0,0,0,1,0,0,0,1,0,0,0,1],faces=[0,2,1,0,1,3,1,2,3,2,0,3];
// Two closed tetrahedra whose tips sit about 0.1 nm apart, well inside the 10 nm weld grid: welding pinches them.
const second=[4,5,6, 4,7,5, 5,7,6, 6,7,4];// tetra with apex below the base, outward winding
const closedTwin={p:new Float32Array(tetra.concat([0,0,2.5,1,0,2.5,0,1,2.5,0,0,1.0000001])),i:new Uint32Array(faces.concat(second))};
const before=MeshRepair.check(closedTwin.p,closedTwin.i);assert.equal(before.closed,true,'fixture is closed');
const r=MeshRepair.repair(closedTwin.p,closedTwin.i);
assert.equal(r.report.closed,true,'a closed mesh stays closed');assert.equal(r.report.alreadyClosed,true);assert.equal(r.report.welded,0);
assert.equal(r.positions,closedTwin.p,'closed meshes are returned untouched');assert.equal(r.indices,closedTwin.i);
const forced=MeshRepair.repair(closedTwin.p,closedTwin.i,{alwaysWeld:true});assert.equal(forced.report.welded,1,'the old weld-always path merges the two tips');assert.equal(forced.report.closed,false,'and pinches the surface, which is why closed meshes skip it');
// Broken meshes still get the full repair.
assert.equal(MeshRepair.repair(new Float32Array(tetra),faces.slice(3)).report.filled,1);
assert.equal(MeshRepair.repair(new Float32Array(tetra),faces.slice(3)).report.closed,true);
assert.throws(()=>MeshRepair.check(new Float32Array(tetra),[0,1,9]),/invalid face indices/);
console.log('Repair keeps closed meshes untouched (near-coincident vertices survive) and still repairs open ones.');
// validateMesh: bucketed counting matches a string-keyed reference, including the non-integer fallback.
const reference=(p,ix)=>{const m=new Map();for(let i=0;i<ix.length;i+=3)for(let j=0;j<3;j++){const a=ix[i+j],b=ix[i+(j+1)%3],k=a<b?a+','+b:b+','+a;m.set(k,(m.get(k)||0)+1)}let boundary=0,nonManifold=0;for(const n of m.values()){if(n===1)boundary++;else if(n>2)nonManifold++}return{boundary,nonManifold}};
let seed=7;const rand=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%n};
for(let t=0;t<40;t++){const nv=4+rand(40),p=new Float32Array(nv*3).map(()=>rand(1000)/100),ix=[];for(let f=0;f<5+rand(120);f++)ix.push(rand(nv),rand(nv),rand(nv));const v=MeshCore.validateMesh(p,ix),ref=reference(p,ix);assert.equal(v.boundary,ref.boundary);assert.equal(v.nonManifold,ref.nonManifold);assert.equal(v.triCount,ix.length/3)}
assert.equal(JSON.stringify(MeshCore.validateMesh(new Float32Array(tetra),faces)),JSON.stringify({triCount:4,zeroArea:0,boundary:0,nonManifold:0}));
console.log('Mesh check counts match the reference on 40 random meshes.');
// 2. Full export through the worker: byte-identical to the pre-speedup build (hashes recorded from main 4a29b81).
const replies=[];const c={console,Blob,Response,DecompressionStream,TextDecoder,performance,postMessage:m=>replies.push(m)};c.self=c;c.globalThis=c;
c.fetch=async u=>new Response(fs.readFileSync(new URL(u,dist)));vm.createContext(c);c.importScripts=(...f)=>f.forEach(n=>vm.runInContext(fs.readFileSync(new URL(n,dist),'utf8'),c,{filename:n}));
vm.runInContext(fs.readFileSync(new URL('template-worker.js',dist),'utf8'),c);
const rows=48,cols=96,hm=Float32Array.from({length:rows*cols},(_,i)=>{const x=i%cols,y=Math.floor(i/cols);return (x>6&&x<30&&y>6&&y<42)||(x>40&&x<90&&y>8&&y<20)||((x-65)**2+(y-32)**2<90)?1:0});
const design=o=>({heightmap:hm,rows,cols,designWidth:24,designHeight:12,designAngle:0,designY:44.5,designRotation:-91,maxHeight:.4,negative:true,sharp:true,...o});
const golden={deboss:[1159642,'a5b99aede8878eb80bd8e4b8816fe6bfee93540c'],debossRepair:[1159642,'a5b99aede8878eb80bd8e4b8816fe6bfee93540c'],emboss:[1159698,'b6150e6a620fa99b7839462ccd8e1bb25a04470f']};
for(const [name,o,repair] of [['deboss',{},false],['debossRepair',{},true],['emboss',{negative:false,designRotation:30},false]]){replies.length=0;const t=Date.now();
 await c.onmessage({data:{type:'export',id:1,format:'stl',repair,options:{sharp:true,designs:[design(o)],maxHeight:.4,negative:o.negative??true}}});
 const m=replies.find(x=>!x.progress);assert(!m.error,m.error);assert.deepEqual([m.validation.boundary,m.validation.nonManifold,m.validation.zeroArea],[0,0,0]);
 assert.equal(m.validation.triCount,golden[name][0]);assert.equal(crypto.createHash('sha1').update(Buffer.from(m.buffer)).digest('hex'),golden[name][1],name+' export bytes changed');
 const stages=replies.filter(x=>x.progress).map(x=>x.progress);assert.equal(stages.join('>'),['Loading template','Forming relief',repair?'Making watertight':'Checking mesh','Writing STL'].join('>'));assert(replies.filter(x=>x.progress).every(x=>x.exportStage));
 console.log('Export',name,'byte-identical,',m.validation.triCount,'triangles,',Date.now()-t,'ms, stages:',stages.join(' > '));}
console.log('Export path tests passed.');
