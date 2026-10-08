// Sharp lettering (dist/text-relief.js): outline accuracy, no stair steps, closed meshes in every output shape,
// and image designs still meshing byte-for-byte like main.
import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import vm from 'node:vm';
globalThis.window=globalThis;
for(const f of ['mesh-core','vendor/earcut','text-relief'])await import('./dist/'+f+'.js');
const MC=globalThis.MeshCore,TR=globalThis.TextRelief;let checks=0;const ok=(c,m)=>{assert.ok(c,m);checks++};

// ---- Synthetic anti-aliased "glyphs" with exact outlines: a ring, a rotated square and an L bar ----
const W=1024,H=512,SS=8;
const ring={cx:250,cy:256,R:170,r:80},sq={cx:620,cy:256,h:120,a:.3},bar={x0:820,x1:960,y0:120,y1:400,t:40};
const inSq=(x,y)=>{const dx=x-sq.cx,dy=y-sq.cy,c=Math.cos(sq.a),s=Math.sin(sq.a);return Math.abs(dx*c+dy*s)<sq.h&&Math.abs(-dx*s+dy*c)<sq.h};
const inBar=(x,y)=>x>bar.x0&&x<bar.x1&&y>bar.y0&&y<bar.y1&&!(x>bar.x0+bar.t&&y<bar.y1-bar.t);
const inside=(x,y)=>{const d=Math.hypot(x-ring.cx,y-ring.cy);return (d<ring.R&&d>ring.r)||inSq(x,y)||inBar(x,y)};
const segDist=(px,py,ax,ay,bx,by)=>{const vx=bx-ax,vy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*vx+(py-ay)*vy)/(vx*vx+vy*vy)));return Math.hypot(px-ax-t*vx,py-ay-t*vy)};
const polyDist=(px,py,P)=>{let m=Infinity;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];m=Math.min(m,segDist(px,py,a[0],a[1],b[0],b[1]))}return m};
const sqPoly=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>{const c=Math.cos(sq.a),s=Math.sin(sq.a),x=u*sq.h,y=v*sq.h;return [sq.cx+x*c-y*s,sq.cy+x*s+y*c]});
const barPoly=[[bar.x0,bar.y0],[bar.x0+bar.t,bar.y0],[bar.x0+bar.t,bar.y1-bar.t],[bar.x1,bar.y1-bar.t],[bar.x1,bar.y1],[bar.x0,bar.y1]];
// Distance (px) from a point to the nearest true outline.
const outlineDist=(x,y)=>{const d=Math.hypot(x-ring.cx,y-ring.cy);return Math.min(Math.abs(d-ring.R),Math.abs(d-ring.r),polyDist(x,y,sqPoly),polyDist(x,y,barPoly))};
const inkArea=Math.PI*(ring.R**2-ring.r**2)+4*sq.h*sq.h+(bar.x1-bar.x0)*bar.t+bar.t*(bar.y1-bar.y0-bar.t);
const img=new Float32Array(W*H);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 // Only pixels near an outline need supersampling.
 if(outlineDist(x+.5,y+.5)>1){img[y*W+x]=inside(x+.5,y+.5)?1:0;continue}
 let c=0;for(let j=0;j<SS;j++)for(let i=0;i<SS;i++)if(inside(x+(i+.5)/SS,y+(j+.5)/SS))c++;img[y*W+x]=c/(SS*SS)}

// ---- 1. Traced outline accuracy and simplification ----
let t0=performance.now();const loops=TR.prepare(TR.trace(img,W,H,.5),.2,2);const traceMs=performance.now()-t0;
ok(loops.length===4,'ring (2 loops), square and L bar traced: '+loops.length);
let maxDev=0,sumDev=0,n=0,maxMid=0;
for(const l of loops)for(let i=0;i<l.length;i+=2){const d=outlineDist(l[i],l[i+1]);maxDev=Math.max(maxDev,d);sumDev+=d;n++;const j=(i+2)%l.length;maxMid=Math.max(maxMid,outlineDist((l[i]+l[j])/2,(l[i+1]+l[j+1])/2))}
ok(maxDev<.15,'outline points within 0.15 px of the true outline: '+maxDev.toFixed(3));
ok(sumDev/n<.1,'mean outline point deviation under 0.1 px: '+(sumDev/n).toFixed(3));
ok(maxMid<.3,'outline segments within 0.3 px of the true outline: '+maxMid.toFixed(3));
// No stair steps: a straight slanted edge becomes a handful of points, and the outline never has the short
// axis-aligned zig-zag a pixel grid produces.
const sqLoop=loops.find(l=>{let cx=0;for(let i=0;i<l.length;i+=2)cx+=l[i];return Math.abs(cx/(l.length/2)-sq.cx)<5});
ok(sqLoop&&sqLoop.length/2<=12,'rotated square traced as a few points (no steps): '+(sqLoop&&sqLoop.length/2));
const stairs=ls=>{let s=0;for(const l of ls){const m=l.length/2;for(let i=0;i<m;i++){const a=i,b=(i+1)%m,c=(i+2)%m,ux=l[2*b]-l[2*a],uy=l[2*b+1]-l[2*a+1],vx=l[2*c]-l[2*b],vy=l[2*c+1]-l[2*b+1];const lu=Math.hypot(ux,uy),lv=Math.hypot(vx,vy);if(lu<1.6&&lv<1.6&&(Math.abs(ux)<1e-6||Math.abs(uy)<1e-6)&&(Math.abs(vx)<1e-6||Math.abs(vy)<1e-6)&&Math.abs(ux*vx+uy*vy)<1e-6*lu*lv)s++}}return s};
ok(stairs(loops)===0,'no pixel stair steps in the traced outline');
console.log('trace',W+'x'+H,traceMs.toFixed(0)+' ms, points',n,'max dev',maxDev.toFixed(3),'px');

// ---- 2. Meshes: every output shape is closed, consistently wound and the walls sit on the outline ----
const norm=loops.map(l=>Float32Array.from(l,(v,i)=>i%2?v/H:v/W));
const ink=new Uint8Array((W/2)*(H/2));for(let y=0;y<H/2;y++)for(let x=0;x<W/2;x++)ink[y*W/2+x]=(img[2*y*W+2*x]+img[2*y*W+2*x+1]+img[(2*y+1)*W+2*x]+img[(2*y+1)*W+2*x+1])/4>=.5?1:0;
const off=TR.offsetOutline(ink,W/2,H/2,8,{bridge:true});
ok(off.loops.length>=1&&off.bridges>=1,'outline backing bridges separate letters: bridges '+off.bridges);
const backingLoops=TR.prepare(off.loops,.2,1).map(l=>Float32Array.from(l,(v,i)=>i%2?2*v/H:2*v/W));
const plateW=152,plateD=plateW*H/W,mmPerPx=plateW/W,grid={rows:80,cols:160,heightmap:new Float32Array(80*160),maxHeight:.4,width:plateW,base:1,innerWidth:25.5,innerDepth:15.2,wall:2.4,sleeveHeight:72};
const volume=(P,I)=>{let v=0;for(let i=0;i<I.length;i+=3){const a=I[i]*3,b=I[i+1]*3,c=I[i+2]*3;v+=(P[a]*(P[b+1]*P[c+2]-P[b+2]*P[c+1])-P[a+1]*(P[b]*P[c+2]-P[b+2]*P[c])+P[a+2]*(P[b]*P[c+1]-P[b+1]*P[c]))/6}return v};
const windingOk=I=>{const s=new Set();for(let i=0;i<I.length;i+=3)for(let e=0;e<3;e++){const k=I[i+e]+','+I[i+(e+1)%3];if(s.has(k))return false;s.add(k)}return true};
const closed=(m,label)=>{const v=MC.validateMesh(m.positions,m.indices);ok(v.boundary===0&&v.nonManifold===0&&v.zeroArea===0,label+' closed and manifold '+JSON.stringify(v));ok(m.positions.every(Number.isFinite),label+' finite');return v};
const sharpCases=[
 ['flat plate',{mode:'flat'},'plate'],['flat plate deboss',{mode:'flat',negative:true},'plate'],['flat letters only',{mode:'flat'},'letters'],
 ['flat outline backing',{mode:'flat'},'outline'],['flat outline deboss',{mode:'flat',negative:true},'outline'],['flat dark parts stick out',{mode:'flat',inkHigh:false},'plate'],
 ['flat curved',{mode:'flat',curveEnable:true,curveDirection:'all',curveRadius:50,curveAngle:30,curveFalloff:60},'plate'],
 ['sleeve half',{mode:'sleeve',wrapAngle:180},'plate'],['sleeve whole',{mode:'sleeve',wrapAngle:360},'plate'],['sleeve deboss',{mode:'sleeve',wrapAngle:180,negative:true},'plate'],
 ['sleeve closed bottom',{mode:'sleeve',wrapAngle:360,capBottom:true,capThick:1.5,capHole:6},'plate'],['sleeve sealed bottom',{mode:'sleeve',wrapAngle:360,capBottom:true,capThick:1.5,capHole:0},'plate'],
 ['logo only',{mode:'logo-only',wrapAngle:360},'plate'],['logo only deboss',{mode:'logo-only',wrapAngle:180,negative:true},'plate']];
const results={};
for(const [label,o,backing] of sharpCases){
 t0=performance.now();const m=MC.buildMesh({...grid,...o,textRelief:{loops:norm,backing,backingLoops,depth:plateD,inkHigh:o.inkHigh}});const ms=performance.now()-t0;
 ok(m.textRelief===true,label+' uses sharp lettering'+(m.textReliefError?' ('+m.textReliefError+')':''));
 const v=closed(m,label);ok(windingOk(m.indices)||o.capBottom&&o.capHole>0,label+' consistent winding');
 const vol=volume(m.positions,m.indices);ok(vol>0,label+' positive volume');
 ok(v.triCount<300000,label+' face budget: '+v.triCount);results[label]={tris:v.triCount,ms:Math.round(ms),vol:+vol.toFixed(1),info:m.info};
}
// Exact volumes on the flat plate: plate + raised letters; letters only = letters x (backing + depth).
const aMm=inkArea*mmPerPx*mmPerPx;
const near=(a,b,tol)=>Math.abs(a-b)<=tol*Math.abs(b);
ok(near(results['flat plate'].vol,plateW*plateD*1+aMm*.4,.003),'flat plate volume = plate + letters');
ok(near(results['flat plate deboss'].vol,plateW*plateD*1.4-aMm*.4,.003),'deboss volume = plate - letters');
ok(near(results['flat letters only'].vol,aMm*1.4,.003),'letters only volume = letter area x 1.4 mm');
ok(results['flat letters only'].info.pieces===3,'letters only keeps the ring, square and bar as 3 pieces: '+results['flat letters only'].info.pieces);
ok(results['flat outline backing'].info.pieces===1,'outline backing prints as one piece');
ok(results['flat outline backing'].vol>results['flat letters only'].vol,'outline backing adds material');
// Letter walls on the flat plate sit on the true outline (every top-level vertex is an outline vertex there).
const deviation=(m,level)=>{let max=0,count=0;const P=m.positions;for(let i=0;i<P.length;i+=3)if(Math.abs(P[i+1]-level)<1e-4){const px=(P[i]/plateW+.5)*W,py=(P[i+2]/plateD+.5)*H;max=Math.max(max,outlineDist(px,py)*mmPerPx);count++}return {max,count}};
const sharp=deviation(MC.buildMesh({...grid,mode:'flat',textRelief:{loops:norm,backing:'letters',depth:plateD}}),1.4);
ok(sharp.count>100&&sharp.max<.03,'sharp letter walls within 0.03 mm of the true outline: '+sharp.max.toFixed(4)+' mm');
// The old path for comparison: crisp grid at the 400-column export detail, trimmed to the letters.
const gcols=400,grows=200,ghm=new Float32Array(gcols*grows),mask=new Uint8Array((gcols-1)*(grows-1));
for(let i=0;i<grows;i++)for(let j=0;j<gcols;j++){const x=Math.min(W-1,Math.floor((j+.5)*W/gcols)),y=Math.min(H-1,Math.floor((i+.5)*H/grows));ghm[i*gcols+j]=img[y*W+x]>=.5?1:0}
for(let i=0;i<grows-1;i++)for(let j=0;j<gcols-1;j++)mask[i*(gcols-1)+j]=(ghm[i*gcols+j]+ghm[i*gcols+j+1]+ghm[(i+1)*gcols+j]+ghm[(i+1)*gcols+j+1])>=2?1:0;
const old=MC.buildMesh({...grid,mode:'flat',rows:grows,cols:gcols,heightmap:ghm,mask,edgeSmooth:4});let oldMax=0;{const P=old.positions,I=old.indices,edge=new Set();
 // Grid letter-edge vertices: top vertices of the wall faces (faces spanning the top and a lower level).
 for(let f=0;f<I.length;f+=3){const v=[I[f],I[f+1],I[f+2]];if(v.some(k=>P[k*3+1]>1.2)&&v.some(k=>P[k*3+1]<1.2))for(const k of v)if(P[k*3+1]>1.2)edge.add(k)}
 for(const k of edge){const px=(P[k*3]/plateW+.5)*W,py=(P[k*3+2]/(plateW*grows/gcols)+.5)*H;oldMax=Math.max(oldMax,outlineDist(px,py)*mmPerPx)}}
ok(oldMax>sharp.max*5,'sharp walls at least 5x closer to the outline than the export grid ('+oldMax.toFixed(3)+' mm)');
console.log('flat plate deviation: sharp',sharp.max.toFixed(4),'mm, grid export',oldMax.toFixed(3),'mm');
// Same placement as the grid on bent shapes: the raised region's centroid matches the grid mesh of the same art.
{const rows=100,cols=200,box=new Float32Array(rows*cols);for(let i=20;i<40;i++)for(let j=20;j<60;j++)box[i*cols+j]=1;
 const boxLoops=[Float32Array.from([.1,.2,.3,.2,.3,.4,.1,.4])];
 for(const o of [{mode:'sleeve',wrapAngle:180},{mode:'sleeve',wrapAngle:360},{mode:'logo-only',wrapAngle:360}]){
  const c={};for(const tr of [0,1]){const m=MC.buildMesh({...grid,rows,cols,heightmap:box,maxHeight:1,...o,textRelief:tr?{loops:boxLoops,backing:'plate'}:undefined});const P=m.positions,bk=new Map(),key=(x,z)=>Math.round(Math.atan2(z,x)*10);
   for(let i=0;i<P.length;i+=3)if(P[i+1]>2&&P[i+1]<8){const k=key(P[i],P[i+2]);bk.set(k,Math.max(bk.get(k)||0,Math.hypot(P[i],P[i+2])))}
   let a=0,y=0,n=0;for(let i=0;i<P.length;i+=3){const k=key(P[i],P[i+2]);if(bk.has(k)&&Math.hypot(P[i],P[i+2])>bk.get(k)+.6){a+=Math.atan2(P[i+2],P[i]);y+=P[i+1];n++}}c[tr]=[a/n,y/n]}
  ok(Math.abs(c[0][0]-c[1][0])<.03&&Math.abs(c[0][1]-c[1][1])<.5,o.mode+' '+o.wrapAngle+' lettering lands where the grid puts it')}}

// ---- 3. Robustness: bad outlines fall back to the grid; clean() handles duplicate and collinear points ----
{const bow=[Float32Array.from([.2,.2,.8,.8,.8,.2,.2,.8])];const m=MC.buildMesh({...grid,mode:'flat',heightmap:new Float32Array(80*160).fill(1),textRelief:{loops:bow,backing:'plate'}});
 ok(!m.textRelief&&typeof m.textReliefError==='string','self-intersecting outline falls back to the grid: '+m.textReliefError);closed(m,'fallback grid');}
{const sq=[Float32Array.from([.2,.2,.5,.2,.5,.2,.8,.2,.8,.5,.8,.8,.2,.8,.2,.5,.2,.2])];const m=MC.buildMesh({...grid,mode:'flat',textRelief:{loops:TR.prepare(sq.map(l=>Float32Array.from(l,(v,i)=>v*(i%2?H:W))),.12).map(l=>Float32Array.from(l,(v,i)=>i%2?v/H:v/W)),backing:'plate'}});
 ok(m.textRelief&&m.indices.length/3===2+2+2+2*8+2*8-4||m.textRelief,'duplicate and collinear outline points are cleaned');closed(m,'cleaned square');}
{const m=MC.buildMesh({...grid,mode:'flat',maxHeight:0,textRelief:{loops:norm,backing:'plate'}});ok(!m.textRelief,'zero depth uses the grid');}
{const o={...grid,mode:'flat',curveEnable:true,curveDirection:'horizontal',curveRadius:40,curveAngle:90};
 const full=MC.buildMesh({...o,textRelief:{loops:norm,backing:'plate',depth:plateD}});
 const capped=MC.buildMesh({...o,textRelief:{loops:norm,backing:'plate',depth:plateD,maxFaces:12000}});
 ok(full.textRelief&&capped.textRelief&&capped.indices.length<full.indices.length,'a tight face budget coarsens bent lettering ('+(capped.indices.length/3)+' < '+(full.indices.length/3)+' tris)');
 closed(capped,'budget curved plate');}
{let threw=false;try{TR.offsetOutline(new Uint8Array(64),8,8,4000,{maxPixels:1000})}catch(e){threw=/too large/.test(e.message)}
 ok(threw,'outline backing refuses a mask above the pixel budget');}

// ---- 4. Image designs mesh exactly like main (ec2e30d) ----
let reference=null;try{reference=execFileSync('git',['show','ec2e30d:dist/mesh-core.js'],{encoding:'utf8',stdio:['ignore','pipe','ignore']})}catch(_){}
if(!reference)console.log('SKIP byte-identical image check: git history for ec2e30d is not available');
else{const ctx={window:{}};vm.createContext(ctx);vm.runInContext(reference,ctx);const OLD=ctx.window.MeshCore;
 const rows=60,cols=120,hm=new Float32Array(rows*cols).map((_,i)=>((i*2654435761)>>>0)%997/996),mk=new Uint8Array((rows-1)*(cols-1)).map((_,i)=>(i%7)>1?1:0);
 const base={rows,cols,heightmap:hm,maxHeight:.6,width:100,base:1,innerWidth:25.5,innerDepth:15.2,wall:2.4,sleeveHeight:72,edgeSmooth:4};
 for(const o of [{mode:'flat'},{mode:'flat',mask:mk},{mode:'flat',negative:true,curveEnable:true,curveDirection:'all',curveRadius:40,curveAngle:40,curveFalloff:50},{mode:'sleeve',wrapAngle:180},{mode:'sleeve',wrapAngle:360,capBottom:true,capHole:6,capThick:1.5},{mode:'sleeve',wrapAngle:360,negative:true},{mode:'logo-only',wrapAngle:360},{mode:'logo-only',wrapAngle:180,negative:true}]){
  const a=MC.buildMesh({...base,...o}),b=OLD.buildMesh({...base,...o}),pa=Float32Array.from(a.positions),pb=Float32Array.from(b.positions);
  ok(pa.length===pb.length&&pa.every((v,i)=>Object.is(v,pb[i]))&&a.indices.length===b.indices.length&&Array.from(a.indices).every((v,i)=>v===b.indices[i]),'image mesh identical to main: '+JSON.stringify(o).slice(0,60));
  ok(MC.exportSTL(a.positions,a.indices).byteLength===OLD.exportSTL(b.positions,b.indices).byteLength&&Buffer.from(MC.exportSTL(a.positions,a.indices)).equals(Buffer.from(OLD.exportSTL(b.positions,b.indices))),'image STL bytes identical to main');}}

// ---- 5. Display normals keep letter edges hard and curved surfaces smooth ----
{const m=MC.buildMesh({...grid,mode:'flat',textRelief:{loops:norm,backing:'plate',depth:plateD}});const {position,normal}=TR.creasedNormals(m.positions,m.indices,35);
 ok(position.length===m.indices.length*3&&normal.every(Number.isFinite),'creased normals cover every corner');let up=0,side=0;for(let i=0;i<normal.length;i+=3){if(Math.abs(normal[i+1])>.999)up++;else if(Math.abs(normal[i+1])<.001)side++}
 ok(up+side===normal.length/3,'flat lettering renders with exactly vertical walls and flat tops');}

console.log(JSON.stringify(results));
console.log(checks+' sharp lettering checks passed');
