import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const context={window:{},console};vm.createContext(context);for(const f of ['mesh-core.js','mesh-repair.js'])vm.runInContext(fs.readFileSync(new URL('./dist/'+f,import.meta.url),'utf8'),context);context.MeshCore=context.window.MeshCore;
const repair=(p,i)=>context.window.MeshRepair.repair(new Float32Array(p),i);
const p=[0,0,0,1,0,0,0,1,0,0,0,1],faces=[0,2,1,0,1,3,1,2,3,2,0,3];
assert.equal(repair(p,faces).report.closed,true);
assert.equal(repair(p,faces.slice(3)).report.filled,1);
assert.equal(repair(p,faces.slice(3)).report.closed,true);
assert.equal(repair(p,faces.concat([0,2,1,0,0,1])).report.removed,2);
const soup=[];for(const v of faces)soup.push(...p.slice(v*3,v*3+3));assert.equal(repair(soup,Array.from({length:12},(_,i)=>i)).report.closed,true);
assert.equal(repair(p.map(v=>v*10),faces.slice(3)).report.closed,false);
assert.equal(repair(p,[0,1,2,...faces.slice(3)]).report.closed,false);
const bow=p.concat([-1,0,0,0,-1,0,0,0,-1]);const second=faces.map(v=>v===0?0:v+3);assert.equal(repair(bow,faces.concat(second)).report.nonManifoldVertices,1);
assert.equal(repair([],[]).report.closed,false);
console.log('9 mesh repair regressions passed: closed, missing face, duplicate/degenerate, weld, large opening, winding, bow-tie, empty.');
const micro=[0,0,0,.01,0,0,0,.01,0,0,0,.000025];
assert.equal(repair(micro,faces).report.closed,true,'valid fine contour faces must survive');
assert.equal(context.window.MeshCore.validateMesh(new Float32Array([0,0,0,1,0,0,2,0,0]),[0,1,2]).zeroArea,1,'collinear faces must still fail');
console.log('Fine-contour precision checks passed.');

