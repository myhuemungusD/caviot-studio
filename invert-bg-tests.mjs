// Dark-parts-stick-out on a trimmed flat plate: only the background outside the artwork is removed, trimmed
// masks never touch at a single corner, and edge smoothing never leaves zero-area faces.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const core={window:{},console};vm.createContext(core);vm.runInContext(fs.readFileSync('dist/mesh-core.js','utf8'),core);const mc=core.window.MeshCore;
const src=fs.readFileSync('dist/image-pipeline.js','utf8');
const fns=src.slice(src.indexOf('function applyBgRemoval'),src.indexOf('function buildHeightmapAtDetail'));
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name)};
// A minimal canvas: drawImage copies the image's RGBA bytes, getImageData returns them.
const ctx={AppState:{},updateBgSwatch(){},document:{createElement(){let data;return {getContext(){return {drawImage(img){data=new Uint8ClampedArray(img.data)},getImageData(){return {data}},putImageData(){}}}}}}};
vm.createContext(ctx);vm.runInContext(fns+';this.applyBgRemoval=applyBgRemoval;this.closeDiagonalMask=closeDiagonalMask;',ctx);
// 40x40 white image with a black square outline (8..31, 2 px thick): white inside and outside.
const W=40,img={width:W,height:W,data:new Uint8ClampedArray(W*W*4)};
for(let y=0;y<W;y++)for(let x=0;x<W;x++){const ring=x>=8&&x<=31&&y>=8&&y<=31&&!(x>=10&&x<=29&&y>=10&&y<=29),v=ring?8:247;img.data.set([v,v+2,v-3,255],(y*W+x)*4)}
const state={bgR:255,bgG:255,bgB:255,bgTol:40,bgSoft:false};
const alpha=(c,x,y)=>c.getContext('2d').getImageData().data[(y*W+x)*4+3];
test('global removal clears the white inside and outside the outline (unchanged default)',()=>{const c=ctx.applyBgRemoval(img,state);assert.equal(alpha(c,2,2),0);assert.equal(alpha(c,20,20),0);assert.equal(alpha(c,8,8),255)});
test('edge-only removal keeps the enclosed white as subject',()=>{const c=ctx.applyBgRemoval(img,state,true);assert.equal(alpha(c,2,2),0);assert.equal(alpha(c,39,39),0);assert.equal(alpha(c,20,20),255);assert.equal(alpha(c,8,8),255)});
test('edge-only removal with a gap in the outline falls back to the outside color',()=>{const g={...img,data:new Uint8ClampedArray(img.data)};for(let y=8;y<10;y++)g.data.set([247,249,244,255],(y*W+20)*4);const c=ctx.applyBgRemoval(g,state,true);assert.equal(alpha(c,20,20),0)});
test('edge-only removal passes through already transparent border pixels',()=>{const g={...img,data:new Uint8ClampedArray(img.data)};for(let x=0;x<W;x++)g.data[x*4+3]=0;const c=ctx.applyBgRemoval(g,state,true);assert.equal(alpha(c,3,3),0);assert.equal(alpha(c,20,20),255)});
// Masks: two cells touching only at a corner are joined.
const flat=(mask,rows,cols,edgeSmooth)=>{const hm=new Float32Array(rows*cols).fill(.5);const m=mc.buildMesh({mode:'flat',heightmap:hm,rows,cols,mask,maxHeight:.4,base:1,width:40,edgeSmooth});return mc.validateMesh(m.positions,m.indices)};
test('corner-only contacts are closed and the trimmed plate is manifold',()=>{const R=6,C=6,m=new Uint8Array(R*C);m[1*C+1]=1;m[2*C+2]=1;m[2*C+4]=1;m[3*C+3]=1;
  const before=flat(Uint8Array.from(m),R+1,C+1,0);assert(before.nonManifold>0,'fixture has corner contacts');
  const added=ctx.closeDiagonalMask(m,R,C);assert(added>0);for(let i=0;i<R-1;i++)for(let j=0;j<C-1;j++){const a=m[i*C+j],b=m[i*C+j+1],c=m[(i+1)*C+j],d=m[(i+1)*C+j+1];assert(!(a&&d&&!b&&!c)&&!(b&&c&&!a&&!d))}
  const v=flat(m,R+1,C+1,4);assert.equal(v.boundary+v.nonManifold+v.zeroArea,0)});
test('a mask without corner contacts is left alone',()=>{const m=new Uint8Array(25).fill(1);assert.equal(ctx.closeDiagonalMask(m,5,5),0)});
// A diamond (45-degree staircase) outline: smoothing straightens it; no face may collapse.
for(const smooth of [0,1,4,10])test('diamond plate closed with edge smoothing '+smooth,()=>{const N=60,m=new Uint8Array(N*N);for(let i=0;i<N;i++)for(let j=0;j<N;j++)if(Math.abs(i-N/2+.5)+Math.abs(j-N/2+.5)<N/2-3)m[i*N+j]=1;const v=flat(m,N+1,N+1,smooth);assert.equal(v.boundary,0);assert.equal(v.nonManifold,0);assert.equal(v.zeroArea,0)});
test('untrimmed plate unchanged by the split rule',()=>{const N=30,m=new Uint8Array(N*N).fill(1);const hm=Float32Array.from({length:(N+1)*(N+1)},(_,i)=>(Math.sin(i)+1)/2);const a=mc.buildMesh({mode:'flat',heightmap:hm,rows:N+1,cols:N+1,mask:m,maxHeight:.4,base:1,width:40,edgeSmooth:4});const b=mc.buildMesh({mode:'flat',heightmap:hm,rows:N+1,cols:N+1,mask:m,maxHeight:.4,base:1,width:40,edgeSmooth:0});assert.deepEqual(Array.from(a.indices),Array.from(b.indices))});
console.log(count+' invert/background checks passed');
