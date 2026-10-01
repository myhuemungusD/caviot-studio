// Smooth (vector) outlines for sharp designs: hard-edged, low-resolution artwork must not come out as pixel stairs,
// thin strokes must stay continuous, corners stay sharp and shapes keep their size.
import assert from 'node:assert/strict';
await import('./dist/template-sharp.js');
const S=globalThis.SharpSleeve;
// Hard-alpha source at 4 px/mm (what background removal gives), enlarged 4x with bilinear filtering like the canvas.
const W=48,H=24,PX=4,UP=4,sw=W*PX,sh=H*PX,cols=sw*UP,rows=sh*UP;
const seg=(x,y,[ax,ay,bx,by])=>{const vx=bx-ax,vy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*vx+(y-ay)*vy)/(vx*vx+vy*vy)));return Math.hypot(x-ax-vx*t,y-ay-vy*t)};
const shapes=[];
for(let i=0;i<8;i++){const a=i*22.5*Math.PI/180,cx=3.5+(i%4)*7,cy=i<4?4:11.5,c=Math.cos(a)*2.6,s=Math.sin(a)*2.6;shapes.push({kind:'stroke',w:.6,seg:[cx-c,cy-s,cx+c,cy+s]})}
shapes.push({kind:'ring',cx:36,cy:8,ro:6,ri:4},{kind:'box',x0:30.5,y0:16.5,x1:45.5,y1:22.5});
const sdf=(s,x,y)=>s.kind==='stroke'?s.w/2-seg(x,y,s.seg):s.kind==='ring'?Math.min(s.ro-Math.hypot(x-s.cx,y-s.cy),Math.hypot(x-s.cx,y-s.cy)-s.ri):Math.min(x-s.x0,s.x1-x,y-s.y0,s.y1-y);
const nearest=(x,y)=>{let best=null,v=-1e9;for(const s of shapes){const d=sdf(s,x,y);if(d>v){v=d;best=s}}return[best,v]};
function enlarge(src){const hm=new Float32Array(cols*rows),at=(x,y)=>src[Math.max(0,Math.min(sh-1,y))*sw+Math.max(0,Math.min(sw-1,x))];
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const fx=(x+.5)/UP-.5,fy=(y+.5)/UP-.5,x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0;hm[y*cols+x]=(at(x0,y0)*(1-tx)+at(x0+1,y0)*tx)*(1-ty)+(at(x0,y0+1)*(1-tx)+at(x0+1,y0+1)*tx)*ty}return hm}
const src=new Float32Array(sw*sh);for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){let c=0;for(let j=0;j<4;j++)for(let i=0;i<4;i++)if(nearest((x+(i+.5)/4)/PX,(y+(j+.5)/4)/PX)[1]>0)c++;src[y*sw+x]=c>=8?1:0}
const hm=enlarge(src),base={heightmap:hm,cols,rows,designWidth:W,designHeight:H,sourceScale:UP};
// Outline points: field crossings along grid rows and columns (what mesh edges see), mm coordinates.
const dx=W/(cols-1),dy=H/(rows-1);
function outline(f){const pts=[];for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=y*cols+x,a=f[i]-.5;if(x+1<cols){const b=f[i+1]-.5;if((a>0)!==(b>0))pts.push([(x+a/(a-b))*dx,y*dy])}if(y+1<rows){const b=f[i+cols]-.5;if((a>0)!==(b>0))pts.push([x*dx,(y+a/(a-b))*dy])}}return pts}
// Jaggedness: signed deviation from the ideal outline minus its mean over the same shape within 1.5 mm.
function jagged(f){const by=new Map();for(const [x,y] of outline(f)){const [s,v]=nearest(x,y);if(s.kind==='stroke'){const [ax,ay,bx,by2]=s.seg,t=((x-ax)*(bx-ax)+(y-ay)*(by2-ay))/((bx-ax)**2+(by2-ay)**2);if(t<.1||t>.9)continue}if(s.kind==='box'&&Math.min(Math.abs(x-s.x0),Math.abs(x-s.x1))<.8&&Math.min(Math.abs(y-s.y0),Math.abs(y-s.y1))<.8)continue;if(!by.has(s))by.set(s,[]);by.get(s).push([x,y,v])}
 const out=[];for(const pts of by.values())for(const p of pts){let sum=0,n=0;for(const q of pts)if((q[0]-p[0])**2+(q[1]-p[1])**2<2.25){sum+=q[2];n++}out.push(Math.abs(p[2]-sum/n))}
 out.sort((a,b)=>a-b);return{rms:Math.sqrt(out.reduce((a,b)=>a+b*b,0)/out.length),p95:out[Math.floor(out.length*.95)],n:out.length}}
const t0=performance.now(),smooth=S.contourField(base),ms=performance.now()-t0,pixel=S.pixelField(base);
const before=jagged(pixel),after=jagged(smooth);
console.log('jaggedness µm: pixel outline rms',(before.rms*1000).toFixed(0),'p95',(before.p95*1000).toFixed(0),'| smooth outline rms',(after.rms*1000).toFixed(0),'p95',(after.p95*1000).toFixed(0),'|',ms.toFixed(0),'ms');
assert(after.rms<before.rms*.5,'staircase must at least halve');assert(after.p95<before.p95*.5);assert(after.rms<.03,'smooth outline within 30 µm rms');
// Size: the ring keeps its area (corner cutting is compensated), the box keeps sharp corners.
const area=(f,x0,y0,x1,y1)=>{let n=0;for(let y=Math.ceil(y0/dy);y*dy<=y1;y++)for(let x=Math.ceil(x0/dx);x*dx<=x1;x++)if(f[y*cols+x]>.5)n++;return n*dx*dy};
const ringArea=area(smooth,29.5,1.5,42.5,14.5),ideal=Math.PI*(36-16);assert(Math.abs(ringArea/ideal-1)<.03,'ring area '+ringArea.toFixed(2)+' vs '+ideal.toFixed(2));
const D={...base,contour:smooth},inside=(x,y)=>S.sampleDistance(D,x/W,y/H)>0;
for(const [x,y,sx,sy] of [[30.5,16.5,1,1],[45.5,16.5,-1,1],[45.5,22.5,-1,-1],[30.5,22.5,1,-1]]){assert(inside(x+sx*.12,y+sy*.12),'box corner stays sharp');assert(!inside(x-sx*.12,y-sy*.12))}
// Thin lines: a one-pixel 8-connected diagonal chain (pixels touching only at corners) stays one continuous stroke at
// least minStroke wide; the pixel outline falls apart at every corner contact.
{const chain=new Float32Array(sw*sh);const pts=[];for(let i=0;i<60;i++){const x=20+i,y=40+Math.round(i*.55);chain[y*sw+x]=1;pts.push([(x+.5)/PX,(y+.5)/PX])}
 const o={heightmap:enlarge(chain),cols,rows,designWidth:W,designHeight:H,sourceScale:UP},f=S.contourField(o),p=S.pixelField(o),E={...o,contour:f},P={...o,contour:p};
 // Along the chain's centre line (y = 40 + 0.55 i in source pixels): inside everywhere, and wide enough.
 let gapsSmooth=0,gapsPixel=0,half=0,n=0;for(let u=2;u<=57;u+=.05){const x=(20+u+.5)/PX,y=(40+.55*u+.5)/PX,v=S.sampleDistance(E,x/W,y/H);n++;half+=v;if(!(v>0))gapsSmooth++;if(!(S.sampleDistance(P,x/W,y/H)>0))gapsPixel++}
 // Width across the stroke at its middle.
 const nx=-.55/Math.hypot(1,.55),ny=1/Math.hypot(1,.55),cx=(20+30.5)/PX,cy=(40+.55*30+.5)/PX;let width=0;for(let t=-1;t<=1;t+=.002)if(S.sampleDistance(E,(cx+nx*t)/W,(cy+ny*t)/H)>0)width+=.002;
 console.log('one-pixel diagonal chain: centre-line gaps smooth',gapsSmooth,'of',n,'pixel',gapsPixel,'| width',width.toFixed(3),'mm');
 assert.equal(gapsSmooth,0,'thin stroke stays continuous');assert(gapsPixel>0,'fixture really is a corner-touching chain');assert(width>=.28,'thin stroke widened to the minimum line width');
 const raw=S.contourField({...o,minStroke:0});assert(raw.filter(v=>v>.5).length<f.filter(v=>v>.5).length,'minStroke 0 disables widening')}
// Sign and finiteness; smoothContours:false is exactly the pixel outline.
assert(smooth.every(Number.isFinite));assert.deepEqual(Array.from(S.contourField({...base,smoothContours:false})),Array.from(pixel));
assert(ms<3000,'vector outline build time '+ms);
console.log('Smooth contour checks passed.');
