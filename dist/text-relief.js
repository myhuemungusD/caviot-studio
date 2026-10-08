'use strict';
/* Sharp lettering ("text relief").
 *
 * Text used to reach the mesh as a raster: Flat plate, Logo only and the parametric sleeve sampled it on the
 * relief grid (160 columns in the preview, at most 400 in the export), so on a 150 mm plate every outline was
 * cut into 0.4-1 mm stair steps. Here the lettering keeps the 2048 x 1024 text image it is rendered to: its
 * anti-aliased outline is traced at the half-coverage level (sub-pixel accurate, about 0.07 mm on a 150 mm plate),
 * simplified within a small tolerance and meshed as polygons: earcut triangulates the faces between the outlines
 * and every outline gets a vertical side wall. The result is closed, the outline is independent of the export
 * detail setting and preview and export are the same mesh.
 *
 * Works in pages, workers and Node vm contexts (globalThis.TextRelief). Needs globalThis.earcut (vendor/earcut.js).
 * Every build validates its own result (closed, manifold, consistent winding, no collapsed faces) and throws if the
 * check fails, so callers can fall back to the raster path instead of exporting a broken mesh.
 */
(function(root){
 const MAX_LOOP_POINTS=400000;   // total outline points accepted from a trace (a 2048 x 1024 text image has < 60k)
 const MAX_FACES=1500000;        // face budget: bent-surface point spacing is coarsened to stay below it
 let faceCap=MAX_FACES;          // build() may lower this for a phone; desktop stays at MAX_FACES

 // ---------------------------------------------------------------------------------------------------------------
 // Outline tracing: marching squares over pixel centres (pixel k covers [k, k+1], its centre is k + 0.5). A point is
 // inside when its value is above `level`; outside the image counts as `outside`. Crossings are linearly
 // interpolated, so anti-aliased edges give sub-pixel positions. Each grid edge carries at most one crossing, so
 // traced loops never cross or touch each other (saddles are split by the cell average).
 function trace(values,w,h,level=.5,outside=0){
  const W=w+2,H=h+2,inside=new Uint8Array(W*H);
  for(let y=0;y<h;y++){const row=(y+1)*W+1,src=y*w;for(let x=0;x<w;x++)if(values[src+x]>level)inside[row+x]=1}
  const val=(x,y)=>x<0||y<0||x>=w||y>=h?outside:values[y*w+x];
  const px=new Map(),next=new Map();
  // Crossing on the horizontal edge (x,y)-(x+1,y) has id 2*((y+1)*W+(x+1)); on the vertical edge (x,y)-(x,y+1) id+1.
  const point=(id,x0,y0,x1,y1)=>{if(!px.has(id)){const a=val(x0,y0),b=val(x1,y1);let t=(level-a)/(b-a);if(!(t>=0))t=0;else if(t>1)t=1;px.set(id,[x0+(x1-x0)*t+.5,y0+(y1-y0)*t+.5])}return id};
  const hEdge=(x,y)=>point(2*((y+1)*W+x+1),x,y,x+1,y),vEdge=(x,y)=>point(2*((y+1)*W+x+1)+1,x,y,x,y+1);
  for(let y=-1;y<h;y++){const r0=(y+1)*W,r1=r0+W;for(let x=-1;x<w;x++){
   const a=inside[r0+x+1],b=inside[r0+x+2],c=inside[r1+x+2],d=inside[r1+x+1],sum=a+b+c+d;if(sum===0||sum===4)continue;
   // Corners clockwise on screen: a top-left, b top-right, c bottom-right, d bottom-left; edges a-b, b-c, c-d, d-a.
   const ins=[a,b,c,d],edge=k=>k===0?hEdge(x,y):k===1?vEdge(x+1,y):k===2?hEdge(x,y+1):vEdge(x,y);
   const enter=[],exit=[];for(let k=0;k<4;k++){const p=ins[k],q=ins[(k+1)&3];if(!p&&q)enter.push(k);else if(p&&!q)exit.push(k)}
   if(enter.length===1)next.set(edge(enter[0]),edge(exit[0]));
   else{const centre=(val(x,y)+val(x+1,y)+val(x+1,y+1)+val(x,y+1))/4>level;
    for(const k of enter){const own=exit.reduce((best,e)=>((e-k+4)%4)<((best-k+4)%4)?e:best),other=exit.find(e=>e!==own);next.set(edge(k),edge(centre?other:own))}}
   if(next.size>MAX_LOOP_POINTS)throw Error('Lettering outline is too detailed.');
  }}
  const loops=[],seen=new Set();
  for(const start of next.keys()){if(seen.has(start))continue;const pts=[];let id=start;while(id!==undefined&&!seen.has(id)){seen.add(id);const p=px.get(id);pts.push(p[0],p[1]);id=next.get(id)}if(pts.length>=6)loops.push(Float64Array.from(pts))}
  return loops;
 }

 // ---------------------------------------------------------------------------------------------------------------
 // Loop helpers (flat [x0,y0,x1,y1,...] arrays, implicitly closed).
 function area(l){let a=0;const n=l.length;for(let i=0;i<n;i+=2){const j=(i+2)%n;a+=l[i]*l[j+1]-l[j]*l[i+1]}return a/2}
 function reverse(l){const out=new Float64Array(l.length),n=l.length/2;for(let i=0;i<n;i++){out[i*2]=l[(n-1-i)*2];out[i*2+1]=l[(n-1-i)*2+1]}return out}
 // Douglas-Peucker on a closed loop: no point of the input is farther than tol from the result.
 function simplify(l,tol){
  const n=l.length/2;if(n<8||!(tol>0))return l;const t2=tol*tol;
  let far=0,best=-1;for(let i=1;i<n;i++){const e=(l[i*2]-l[0])**2+(l[i*2+1]-l[1])**2;if(e>best){best=e;far=i}}
  const keep=new Uint8Array(n);keep[0]=keep[far]=1;const stack=[0,far,far,n];
  while(stack.length){const e=stack.pop(),s=stack.pop(),ax=l[s*2],ay=l[s*2+1],bx=l[(e%n)*2],by=l[(e%n)*2+1],vx=bx-ax,vy=by-ay,L=vx*vx+vy*vy;let m=-1,md=t2;
   for(let i=s+1;i<e;i++){const qx=l[i*2]-ax,qy=l[i*2+1]-ay;let t=L?(qx*vx+qy*vy)/L:0;t=t<0?0:t>1?1:t;const ex=qx-vx*t,ey=qy-vy*t,d=ex*ex+ey*ey;if(d>md){md=d;m=i}}
   if(m>=0){keep[m]=1;stack.push(s,m,m,e)}}
  const out=[];for(let i=0;i<n;i++)if(keep[i])out.push(l[i*2],l[i*2+1]);return out.length>=6?Float64Array.from(out):l;
 }
 // Drop points closer than minLen to the previous kept point and points (almost exactly) on the line through their
 // neighbours: earcut silently skips exactly collinear points, which would leave a crack beside the side wall.
 function clean(l,minLen){
  let pts=Array.from(l);const m2=minLen*minLen;
  for(let pass=0;pass<8;pass++){const n=pts.length/2;if(n<3)return null;const out=[];let changed=false;
   for(let i=0;i<n;i++){const px=pts[((i-1+n)%n)*2],py=pts[((i-1+n)%n)*2+1],x=pts[i*2],y=pts[i*2+1],nx=pts[((i+1)%n)*2],ny=pts[((i+1)%n)*2+1];
    const ux=x-px,uy=y-py,vx=nx-x,vy=ny-y,cross=ux*vy-uy*vx,lu=ux*ux+uy*uy,lv=vx*vx+vy*vy;
    if(lu<m2||Math.abs(cross)<=1e-9*Math.sqrt(lu*lv)){changed=true;continue}out.push(x,y)}
   pts=out;if(!changed)break}
  return pts.length>=6?Float64Array.from(pts):null;
 }
 // True when any two segments of different loops (or non-adjacent segments of one loop) intersect or touch.
 function intersecting(loops){
  const segs=[];let len=0;
  for(let k=0;k<loops.length;k++){const l=loops[k],n=l.length/2;for(let i=0;i<n;i++){const j=(i+1)%n;segs.push(k,i,n);len+=Math.hypot(l[j*2]-l[i*2],l[j*2+1]-l[i*2+1])}}
  const count=segs.length/3;if(count<2)return [];const cell=Math.max(1e-6,2*len/count),grid=new Map(),hits=new Set();
  const P=(s,e)=>{const l=loops[segs[s*3]],i=(segs[s*3+1]+e)%segs[s*3+2];return [l[i*2],l[i*2+1]]};
  const orient=(a,b,c)=>{const v=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);return v>0?1:v<0?-1:0};
  const onSeg=(a,b,c)=>Math.min(a[0],b[0])<=c[0]&&c[0]<=Math.max(a[0],b[0])&&Math.min(a[1],b[1])<=c[1]&&c[1]<=Math.max(a[1],b[1]);
  const cross=(s,t)=>{const a=P(s,0),b=P(s,1),c=P(t,0),d=P(t,1),o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);if(o1!==o2&&o3!==o4)return true;return (o1===0&&onSeg(a,b,c))||(o2===0&&onSeg(a,b,d))||(o3===0&&onSeg(c,d,a))||(o4===0&&onSeg(c,d,b))};
  for(let s=0;s<count;s++){const a=P(s,0),b=P(s,1),x0=Math.floor(Math.min(a[0],b[0])/cell),x1=Math.floor(Math.max(a[0],b[0])/cell),y0=Math.floor(Math.min(a[1],b[1])/cell),y1=Math.floor(Math.max(a[1],b[1])/cell);
   if((x1-x0+1)*(y1-y0+1)>4096)return [...new Set(segs.filter((_,i)=>i%3===0))];
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const key=x+','+y;let list=grid.get(key);if(!list)grid.set(key,list=[]);
    for(const t of list){const same=segs[t*3]===segs[s*3],n=segs[s*3+2],di=Math.abs(segs[t*3+1]-segs[s*3+1]);if(same&&(di<=1||di===n-1))continue;if(cross(s,t)){hits.add(segs[s*3]);hits.add(segs[t*3])}}
    list.push(s)}}
  return [...hits];
 }
 // Simplify traced loops within tol; loops that would then cross another one keep finer versions (the raw trace
 // never self-intersects). Specks smaller than minArea are dropped.
 function prepare(raw,tol,minArea=.05){
  const keep=raw.filter(l=>Math.abs(area(l))>=minArea);
  const at=(t)=>keep.map(l=>t>0?clean(simplify(l,t),1e-4):clean(l,1e-5));
  let loops=at(tol);
  for(const t of [tol/4,0]){const bad=intersecting(loops.filter(Boolean));if(!bad.length&&loops.every(Boolean))break;const finer=at(t),present=loops.filter(Boolean);const badSet=new Set(bad.map(i=>present[i]));loops=loops.map((l,i)=>!l||badSet.has(l)?finer[i]:l)}
  return loops.filter(Boolean);
 }

 // ---------------------------------------------------------------------------------------------------------------
 // Exact Euclidean distance (pixels) to the nearest set pixel (Felzenszwalb & Huttenlocher).
 function distanceField(mask,w,h){
  const INF=1e20,f=new Float64Array(Math.max(w,h)),d=new Float64Array(Math.max(w,h)),v=new Int32Array(Math.max(w,h)),z=new Float64Array(Math.max(w,h)+1),grid=new Float64Array(w*h);
  for(let i=0;i<w*h;i++)grid[i]=mask[i]?0:INF;
  const pass=(n)=>{let k=0;v[0]=0;z[0]=-INF;z[1]=INF;for(let q=1;q<n;q++){let s;for(;;){const r=v[k];s=((f[q]+q*q)-(f[r]+r*r))/(2*q-2*r);if(s<=z[k]&&k>0){k--;continue}if(s<=z[k]){k--;break}break}k++;v[k]=q;z[k]=s;z[k+1]=INF}
   k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;const r=v[k];d[q]=(q-r)*(q-r)+f[r]}};
  for(let x=0;x<w;x++){for(let y=0;y<h;y++)f[y]=grid[y*w+x];pass(h);for(let y=0;y<h;y++)grid[y*w+x]=d[y]}
  for(let y=0;y<h;y++){for(let x=0;x<w;x++)f[x]=grid[y*w+x];pass(w);for(let x=0;x<w;x++)grid[y*w+x]=d[x]}
  const out=new Float32Array(w*h);for(let i=0;i<w*h;i++)out[i]=Math.sqrt(grid[i]);return out;
 }
 // Backing that follows the lettering: everything within `radius` pixels of the ink (a rounded offset outline).
 // Separate pieces are joined by straight bridges of the same width (closest points, minimum spanning tree), so the
 // backing prints as one piece. ink: Uint8Array mask (w x h). Returns loops in the mask's pixel coordinates.
 function offsetOutline(ink,w,h,radius,options={}){
  const r=Math.max(1,radius),pad=Math.ceil(r)+3,W=w+pad*2,H=h+pad*2,maxPixels=options.maxPixels>0?options.maxPixels:24e6;if(W*H>maxPixels)throw Error('Outline backing is too large for this device.');
  const m=new Uint8Array(W*H);let any=false;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(ink[y*w+x]){m[(y+pad)*W+x+pad]=1;any=true}
  if(!any)return {loops:[],bridges:0};
  const D=distanceField(m,W,H);
  // Components of the dilated shape.
  const label=new Int32Array(W*H).fill(-1),stack=new Int32Array(W*H);let comps=0;const edgeInk=[];
  for(let s=0;s<W*H;s++){if(label[s]>=0||!(D[s]<=r))continue;let top=0;stack[top++]=s;label[s]=comps;const pts=[];
   while(top){const p=stack[--top],x=p%W;
    // Only the ink's own edge pixels can be the closest points to another piece.
    if(m[p]&&(!m[p-1]||!m[p+1]||!m[p-W]||!m[p+W]))pts.push(p);
    for(const q of [x>0?p-1:-1,x<W-1?p+1:-1,p-W,p+W])if(q>=0&&q<W*H&&label[q]<0&&D[q]<=r){label[q]=comps;stack[top++]=q}}
   edgeInk.push(pts);comps++}
  let bridges=0;
  if(comps>1&&options.bridge!==false){
   // Closest sampled edge points of every pair of pieces (samples per piece chosen so all pairs together take about
   // 2*10^7 distance tests), then Prim's minimum spanning tree over those distances.
   const per=Math.max(12,Math.min(300,Math.floor(Math.sqrt(4e7/(comps*(comps-1)))))),samples=edgeInk.map(pts=>{const step=Math.max(1,Math.ceil(pts.length/per));return pts.filter((_,i)=>i%step===0)});
   const best=new Float64Array(comps*comps).fill(Infinity),pairA=new Int32Array(comps*comps),pairB=new Int32Array(comps*comps);
   for(let a=0;a<comps;a++)for(let b=a+1;b<comps;b++){let d0=Infinity,pa=-1,pb=-1;for(const p of samples[a]){const px=p%W,py=p/W|0;for(const q of samples[b]){const dx=px-q%W,dy=py-(q/W|0),d=dx*dx+dy*dy;if(d<d0){d0=d;pa=p;pb=q}}}best[a*comps+b]=best[b*comps+a]=d0;pairA[a*comps+b]=pa;pairB[a*comps+b]=pb;pairA[b*comps+a]=pb;pairB[b*comps+a]=pa}
   const inTree=new Uint8Array(comps),dist=new Float64Array(comps).fill(Infinity),from=new Int32Array(comps).fill(-1);inTree[0]=1;for(let b=1;b<comps;b++){dist[b]=best[b];from[b]=0}
   for(let added=1;added<comps;added++){let cb=-1;for(let b=0;b<comps;b++)if(!inTree[b]&&(cb<0||dist[b]<dist[cb]))cb=b;inTree[cb]=1;bridges++;
    const pa=pairA[from[cb]*comps+cb],pb=pairB[from[cb]*comps+cb];
    for(let b=0;b<comps;b++)if(!inTree[b]&&best[cb*comps+b]<dist[b]){dist[b]=best[cb*comps+b];from[b]=cb}
    // Capsule of radius r along the bridge, written into the distance field.
    const ax=pa%W,ay=pa/W|0,bx=pb%W,by=pb/W|0,vx=bx-ax,vy=by-ay,L=vx*vx+vy*vy,x0=Math.max(0,Math.floor(Math.min(ax,bx)-r-2)),x1=Math.min(W-1,Math.ceil(Math.max(ax,bx)+r+2)),y0=Math.max(0,Math.floor(Math.min(ay,by)-r-2)),y1=Math.min(H-1,Math.ceil(Math.max(ay,by)+r+2));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){let t=L?((x-ax)*vx+(y-ay)*vy)/L:0;t=t<0?0:t>1?1:t;const d=Math.hypot(x-ax-vx*t,y-ay-vy*t),k=y*W+x;if(d<D[k])D[k]=d}}}
  const neg=new Float32Array(W*H);for(let i=0;i<W*H;i++)neg[i]=-D[i];
  // Level nudged so no sample (square roots of integers) sits exactly on it.
  const loops=trace(neg,W,H,-(r+1e-4),-1e9).map(l=>{for(let i=0;i<l.length;i++)l[i]-=pad;return l});
  return {loops,bridges,pieces:comps};
 }

 // ---------------------------------------------------------------------------------------------------------------
 // Triangulation. Loops must not cross. Filled = inside an odd number of loops. Each loop has a vertex index per
 // point; faces use only those vertices. `up` chooses the winding in the (X,Y) plane: positive area when true.
 function nesting(loops){
  const n=loops.length,box=loops.map(l=>{let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(let i=0;i<l.length;i+=2){a=Math.min(a,l[i]);c=Math.max(c,l[i]);b=Math.min(b,l[i+1]);d=Math.max(d,l[i+1])}return[a,b,c,d]});
  const contains=(o,l)=>{const x=l[0],y=l[1],b=box[o];if(x<b[0]||x>b[2]||y<b[1]||y>b[3])return false;const p=loops[o];let c=false;for(let i=0,j=p.length-2;i<p.length;j=i,i+=2){const yi=p[i+1],yj=p[j+1];if((yi>y)!==(yj>y)&&x<(p[j]-p[i])*(y-yi)/(yj-yi)+p[i])c=!c}return c};
  const depth=new Int32Array(n),parent=new Int32Array(n).fill(-1),areaAbs=loops.map(l=>Math.abs(area(l)));
  for(let i=0;i<n;i++)for(let o=0;o<n;o++){if(o===i||areaAbs[o]<=areaAbs[i])continue;if(contains(o,loops[i])){depth[i]++;if(parent[i]<0||areaAbs[o]<areaAbs[parent[i]])parent[i]=o}}
  return {depth,parent};
 }
 // Triangulation of one filled region (outer loop + holes) and, optionally, interior points so no triangle is much
 // larger than `spacing` (needed where the surface is bent afterwards). earcut gives the first triangulation; loop
 // points it skipped (exactly collinear ones, e.g. from densify) are put back by splitting the boundary edge they lie
 // on; then Delaunay flips and interior points on a hexagonal grid, inserted with Lawson flips. Boundary edges are
 // never flipped, so the side walls built from the same loop points still meet the faces edge to edge.
 function cdtRegion(tris,X,Y,Z,z,loopsIdx,spacing){
  const T=[],N=[];const nt=()=>T.length/3;
  for(let i=0;i<tris.length;i++)T.push(tris[i]);
  const orientP=(a,b,px,py)=>(X[b]-X[a])*(py-Y[a])-(Y[b]-Y[a])*(px-X[a]);
  const edgeMap=new Map(),ek=(a,b)=>a*4294967296+b;
  const rebuild=()=>{edgeMap.clear();N.length=T.length;for(let t=0;t<nt();t++)for(let e=0;e<3;e++)edgeMap.set(ek(T[t*3+e],T[t*3+(e+1)%3]),t*3+e);for(let t=0;t<nt();t++)for(let e=0;e<3;e++){const o=edgeMap.get(ek(T[t*3+(e+1)%3],T[t*3+e]));N[t*3+e]=o===undefined?-1:(o/3|0)}};
  // Delaunay flips. Triangle t = (a,b,c) counter-clockwise; edge e runs T[e] -> T[e+1].
  const inCircle=(a,b,c,d)=>{const ax=X[a]-X[d],ay=Y[a]-Y[d],bx=X[b]-X[d],by=Y[b]-Y[d],cx=X[c]-X[d],cy=Y[c]-Y[d];return (ax*ax+ay*ay)*(bx*cy-cx*by)-(bx*bx+by*by)*(ax*cy-cx*ay)+(cx*cx+cy*cy)*(ax*by-bx*ay)>1e-12};
  const fixBack=(u,a,b,t)=>{if(u<0)return;for(let e=0;e<3;e++)if(T[u*3+e]===a&&T[u*3+(e+1)%3]===b){N[u*3+e]=t;return}};
  const rotate=(t,e)=>{if(!e)return;const v=[T[t*3],T[t*3+1],T[t*3+2]],n=[N[t*3],N[t*3+1],N[t*3+2]];for(let k=0;k<3;k++){T[t*3+k]=v[(k+e)%3];N[t*3+k]=n[(k+e)%3]}};
  // Flip edge 0 of t (a,b) with its neighbour; afterwards t = (a,d,c) and u = (d,b,c); returns u or -1.
  const flip=(t)=>{const u=N[t*3];if(u<0)return -1;const a=T[t*3],b=T[t*3+1],c=T[t*3+2];let f=0;while(f<3&&!(T[u*3+f]===b&&T[u*3+(f+1)%3]===a))f++;if(f===3)return -1;rotate(u,f);const d=T[u*3+2];
   if(!(orientP(c,a,X[d],Y[d])>0&&orientP(d,b,X[c],Y[c])>0))return -1;if(!inCircle(a,b,c,d))return -1;
   const nca=N[t*3+2],nbc=N[t*3+1],nad=N[u*3+1],ndb=N[u*3+2];
   T[t*3]=a;T[t*3+1]=d;T[t*3+2]=c;N[t*3]=nad;N[t*3+1]=u;N[t*3+2]=nca;T[u*3]=d;T[u*3+1]=b;T[u*3+2]=c;N[u*3]=ndb;N[u*3+1]=nbc;N[u*3+2]=t;
   fixBack(nad,d,a,t);fixBack(nbc,c,b,u);return u};
  // Flip every non-Delaunay interior edge (Lawson). Also removes earcut's slivers along nearly straight outlines.
  const flipAll=()=>{let budget=40*nt()+1000;const queue=[];for(let t=0;t<nt();t++)for(let e=0;e<3;e++)if(N[t*3+e]>t)queue.push(t,T[t*3+e],T[t*3+(e+1)%3]);
   while(queue.length&&budget-->0){const b=queue.pop(),a=queue.pop(),t=queue.pop();let e=0;while(e<3&&!(T[t*3+e]===a&&T[t*3+(e+1)%3]===b))e++;if(e===3)continue;rotate(t,e);const u=flip(t);if(u<0)continue;
    queue.push(t,T[t*3],T[t*3+1],t,T[t*3+2],T[t*3],u,T[u*3],T[u*3+1],u,T[u*3+1],T[u*3+2])}};
  // 1. Flip first, so a skipped point is never put back into a sliver whose third corner is on the same line.
  rebuild();flipAll();
  // 2. Loop points earcut skipped.
  const used=new Set(T);rebuild();
  for(const ids of loopsIdx){const n=ids.length;let first=-1;for(let i=0;i<n;i++)if(used.has(ids[i])){first=i;break}if(first<0)throw Error('Lettering triangulation lost an outline.');
   for(let k=0;k<n;){const i=(first+k)%n,a=ids[i];let m=1;while(m<n&&!used.has(ids[(i+m)%n]))m++;const b=ids[(i+m)%n];
    if(m>1){let cur=a;for(let q=1;q<m;q++){const p=ids[(i+q)%n];let slot=edgeMap.get(ek(cur,b)),fwd=true;if(slot===undefined){slot=edgeMap.get(ek(b,cur));fwd=false}if(slot===undefined)throw Error('Lettering triangulation has a gap.');
      const t=slot/3|0,e=slot%3,v0=T[t*3+e],v1=T[t*3+(e+1)%3],c=T[t*3+(e+2)%3];T[t*3]=v0;T[t*3+1]=p;T[t*3+2]=c;T.push(p,v1,c);
      edgeMap.set(ek(v0,p),t*3);edgeMap.set(ek(p,c),t*3+1);edgeMap.set(ek(c,v0),t*3+2);const u=nt()-1;edgeMap.set(ek(p,v1),u*3);edgeMap.set(ek(v1,c),u*3+1);edgeMap.set(ek(c,p),u*3+2);edgeMap.delete(ek(v0,v1));
      used.add(p);if(fwd)cur=p;else cur=p}}
    k+=m}}
  // 3. Flip again around the re-inserted points.
  rebuild();flipAll();
  if(!(spacing>0))return T;
  // 4. Interior points (hexagonal grid), kept 0.45 spacing away from every boundary edge.
  const segs=[];for(const ids of loopsIdx)for(let i=0;i<ids.length;i++)segs.push(ids[i],ids[(i+1)%ids.length]);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const ids of loopsIdx)for(const v of ids){minX=Math.min(minX,X[v]);maxX=Math.max(maxX,X[v]);minY=Math.min(minY,Y[v]);maxY=Math.max(maxY,Y[v])}
  const cell=spacing,grid=new Map(),gk=(x,y)=>x*1048576+y,clear=.45*spacing;
  for(let s=0;s<segs.length;s+=2){const a=segs[s],b=segs[s+1],x0=Math.floor((Math.min(X[a],X[b])-clear)/cell),x1=Math.floor((Math.max(X[a],X[b])+clear)/cell),y0=Math.floor((Math.min(Y[a],Y[b])-clear)/cell),y1=Math.floor((Math.max(Y[a],Y[b])+clear)/cell);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const k=gk(x+524288,y+524288);let l=grid.get(k);if(!l)grid.set(k,l=[]);l.push(s)}}
  const nearEdge=(px,py)=>{const l=grid.get(gk(Math.floor(px/cell)+524288,Math.floor(py/cell)+524288));if(!l)return false;for(const s of l){const a=segs[s],b=segs[s+1],vx=X[b]-X[a],vy=Y[b]-Y[a],L=vx*vx+vy*vy;let t=L?((px-X[a])*vx+(py-Y[a])*vy)/L:0;t=t<0?0:t>1?1:t;if(Math.hypot(px-X[a]-vx*t,py-Y[a]-vy*t)<clear)return true}return false};
  const rowH=spacing*Math.sqrt(3)/2,maxPoints=Math.max(0,(faceCap/2|0)-nt()),bucket=new Map(),bk=(x,y)=>Math.floor(x/(4*spacing))*1048576+Math.floor(y/(4*spacing));let added=0;
  for(let t=0;t<nt();t++)bucket.set(bk(X[T[t*3]],Y[T[t*3]]),t);
  const contains=(t,px,py)=>orientP(T[t*3],T[t*3+1],px,py)>=0&&orientP(T[t*3+1],T[t*3+2],px,py)>=0&&orientP(T[t*3+2],T[t*3],px,py)>=0;
  const locate=(px,py)=>{let t=bucket.get(bk(px,py));if(t===undefined)t=0;
   for(let steps=0;steps<2000;steps++){let next=-2;for(let e=0;e<3;e++)if(orientP(T[t*3+e],T[t*3+(e+1)%3],px,py)<0){next=N[t*3+e];break}if(next===-2)return t;if(next<0)break;t=next}
   for(let q=0;q<nt();q++)if(contains(q,px,py))return q;return -1};
  const legalize=(t)=>{const stack=[t];let guard=400;while(stack.length&&guard-->0){const s=stack.pop();const u=flip(s);if(u>=0)stack.push(s,u)}};
  for(let y=Math.ceil(minY/rowH)*rowH;y<maxY&&added<maxPoints;y+=rowH){const off=(Math.round(y/rowH)&1)?spacing/2:0;
   // Even-odd crossings of this row: only points inside the region are inserted.
   const xs=[];for(let s=0;s<segs.length;s+=2){const a=segs[s],b=segs[s+1];if((Y[a]>y)!==(Y[b]>y))xs.push(X[a]+(X[b]-X[a])*(y-Y[a])/(Y[b]-Y[a]))}xs.sort((p,q)=>p-q);let ci=0;
   for(let x=Math.ceil((minX-off)/spacing)*spacing+off;x<maxX;x+=spacing){while(ci<xs.length&&xs[ci]<x)ci++;if(!(ci&1)||nearEdge(x,y))continue;const t=locate(x,y);if(t<0)continue;
    const a=T[t*3],b=T[t*3+1],c=T[t*3+2];if(orientP(a,b,x,y)<1e-12||orientP(b,c,x,y)<1e-12||orientP(c,a,x,y)<1e-12)continue;if(added++>=maxPoints)break;
    const p=X.length;X.push(x);Y.push(y);Z.push(z);const nab=N[t*3],nbc=N[t*3+1],nca=N[t*3+2],t1=nt(),t2=t1+1;
    // p at index 2 of each new triangle, so legalize() always tests edge 0 (the old edge).
    T[t*3]=a;T[t*3+1]=b;T[t*3+2]=p;N[t*3]=nab;N[t*3+1]=t1;N[t*3+2]=t2;
    T.push(b,c,p,c,a,p);N.push(nbc,t2,t,nca,t,t1);fixBack(nbc,c,b,t1);fixBack(nca,a,c,t2);bucket.set(bk(x,y),t);
    legalize(t);legalize(t1);legalize(t2)}}
  return T;
 }
 function triangulate(loops,ids,up,faces,X,Y,Z,z,spacing){
  const earcut=root.earcut;if(typeof earcut!=='function')throw Error('Triangulation library missing.');
  const {depth,parent}=nesting(loops);let filled=0,covered=0;
  for(let o=0;o<loops.length;o++){if(depth[o]%2)continue;const group=[o];for(let h=0;h<loops.length;h++)if(parent[h]===o&&depth[h]===depth[o]+1)group.push(h);
   // Earcut gets only the corners: points on a straight run (densified ones) can make it emit folded slivers, so
   // cdtRegion() puts them back afterwards by splitting the boundary edge they lie on.
   const coords=[],map=[],holes=[];for(const k of group){if(coords.length)holes.push(coords.length/2);const l=loops[k],n=l.length/2;
    for(let i=0;i<n;i++){const h=(i+n-1)%n,j=(i+1)%n,ux=l[2*i]-l[2*h],uy=l[2*i+1]-l[2*h+1],vx=l[2*j]-l[2*i],vy=l[2*j+1]-l[2*i+1];
     if(Math.abs(ux*vy-uy*vx)<=1e-7*Math.hypot(ux,uy)*Math.hypot(vx,vy)&&ux*vx+uy*vy>0)continue;coords.push(l[2*i],l[2*i+1]);map.push(ids[k][i])}}
   const tri=earcut(coords,holes.length?holes:null),ccw=[];
   let polyArea=Math.abs(area(loops[o]));for(const h of group.slice(1))polyArea-=Math.abs(area(loops[h]));filled+=polyArea;
   for(let t=0;t<tri.length;t+=3){const a=map[tri[t]],b=map[tri[t+1]],c=map[tri[t+2]];const s=(X[b]-X[a])*(Y[c]-Y[a])-(Y[b]-Y[a])*(X[c]-X[a]);if(s>0)ccw.push(a,b,c);else ccw.push(a,c,b)}
   const T=cdtRegion(ccw,X,Y,Z,z,group.map(k=>ids[k]),spacing);
   for(let t=0;t<T.length;t+=3){const a=T[t],b=T[t+1],c=T[t+2],s=(X[b]-X[a])*(Y[c]-Y[a])-(Y[b]-Y[a])*(X[c]-X[a]);covered+=Math.abs(s)/2;if(up)faces.push(a,b,c);else faces.push(a,c,b)}}
  if(!(Math.abs(covered-filled)<=1e-6*Math.max(1,filled)))throw Error('Lettering triangulation failed.');
 }
 // Points every `spacing` or closer along each edge (bent surfaces need short outline segments).
 function densify(l,spacing){if(!(spacing>0))return l;const out=[],n=l.length/2;for(let i=0;i<n;i++){const j=(i+1)%n,x=l[i*2],y=l[i*2+1],dx=l[j*2]-x,dy=l[j*2+1]-y,k=Math.ceil(Math.hypot(dx,dy)/spacing);for(let q=0;q<Math.max(1,k);q++)out.push(x+dx*q/k,y+dy*q/k)}return Float64Array.from(out)}
 // Side walls between two copies of a loop (lo below hi). The wall faces toward the side given by `outwardLeft`
 // (true: the left of the loop direction).
 function walls(lo,hi,X,Y,outwardLeft,faces){
  const n=lo.length;for(let i=0;i<n;i++){const j=(i+1)%n,a=lo[i],b=lo[j],dx=X[b]-X[a],dy=Y[b]-Y[a];
   // (a, b, hi[j]) has a horizontal normal toward the right of a->b (for positive height in a right-handed X,Y,Z).
   if(outwardLeft)faces.push(a,hi[j],b,a,hi[i],hi[j]);else faces.push(a,b,hi[j],a,hi[j],hi[i]);
   if(dx===0&&dy===0)throw Error('Lettering outline has a repeated point.')}
 }
 // Orientation normalised: filled regions to the left of every loop (outer loops counter-clockwise in X,Y).
 function orient(loops){const {depth}=nesting(loops);return loops.map((l,i)=>((area(l)>0)===(depth[i]%2===0))?l:reverse(l))}

 // ---------------------------------------------------------------------------------------------------------------
 // Self check: closed, two faces per edge, each directed edge once (consistent winding), no collapsed face.
 // windingFaces: how many leading indices to check for winding (default all). The parametric sleeve's closed bottom
 // with a push-out hole already has a reversed hole wall in the grid builder, so there only the lettering surface
 // (the leading faces) is checked.
 function check(positions,indices,MC,windingFaces=indices.length){
  const v=MC.validateMesh(positions,indices);if(v.boundary||v.nonManifold||v.zeroArea)throw Error('Lettering mesh check failed ('+v.boundary+' open, '+v.nonManifold+' non-manifold, '+v.zeroArea+' collapsed).');
  const seen=new Set();for(let i=0;i<windingFaces;i+=3)for(let j=0;j<3;j++){const a=indices[i+j],b=indices[i+(j+1)%3],k=a*4294967296+b;if(seen.has(k))throw Error('Lettering mesh has inconsistent winding.');seen.add(k)}
  for(let i=0;i<positions.length;i++)if(!Number.isFinite(positions[i]))throw Error('Lettering mesh has invalid coordinates.');
  return v;
 }
 const toFloat=(arr)=>arr instanceof Float32Array?arr:Float32Array.from(arr);
 // Loops (normalised u,v in the artwork rectangle) to domain coordinates via fx/fy.
 const mapLoops=(loops,fx,fy)=>loops.map(l=>{const out=new Float64Array(l.length);for(let i=0;i<l.length;i+=2){out[i]=fx(l[i]);out[i+1]=fy(l[i+1])}return out});
 function addCopy(V,loop,z){const ids=new Int32Array(loop.length/2);for(let i=0;i<loop.length;i+=2){ids[i/2]=V.X.length;V.X.push(loop[i]);V.Y.push(loop[i+1]);V.Z.push(z)}return ids}
 function cleanAll(loops,minLen){return loops.map(l=>clean(l,minLen)).filter(Boolean)}

 // Flat plate. o: MeshCore flat options plus o.textRelief = {loops, backing: 'plate'|'outline'|'letters', backingLoops}.
 // Plate coordinates: x = (u - .5) * width, z = (v - .5) * depth, y up; backing from y = 0.
 function buildFlat(o,MC){
  const t=o.textRelief,width=Math.max(1,+o.width||100),depth=Math.max(1,+t.depth||width*(o.rows/o.cols)),base=Math.max(.1,+o.base||1),maxH=Math.max(0,+o.maxHeight||0),negative=!!o.negative,backing=t.backing||'plate';
  if(!(maxH>=.005))throw Error('Lettering needs some depth.');
  const fx=u=>(u-.5)*width,fy=v=>(v-.5)*depth,minLen=1e-4;
  // A curved plate is bent after meshing, so outlines and faces then get points at least every `spacing`.
  const spacing=o.curveEnable?curveSpacing(width*depth,Math.max(1,+o.curveRadius||50)):0;
  const L=orient(cleanAll(mapLoops(t.loops||[],fx,fy),minLen)).map(l=>densify(l,spacing));if(!L.length)throw Error('No lettering outline found.');
  let B=[];if(backing==='plate')B=[Float64Array.from([-width/2,-depth/2,width/2,-depth/2,width/2,depth/2,-width/2,depth/2])];
  else if(backing==='outline'){B=orient(cleanAll(mapLoops(t.backingLoops||[],fx,fy),minLen));if(!B.length)throw Error('No outline backing found.')}
  B=B.map(l=>densify(l,spacing));
  // Same levels as the grid plate: y = base + h (raised) or base + depth - h (carved), where the lettering has
  // h = depth unless "Light parts stick out" is off (t.inkHigh === false), which swaps lettering and background.
  const level=h=>negative?base+maxH-h:base+h,inkH=t.inkHigh===false?0:maxH,hInk=level(inkH),hBg=level(maxH-inkH);
  if(backing!=='letters'&&!(Math.abs(hInk-hBg)>=.005))throw Error('Lettering needs some depth.');
  if(!(hInk>=.05))throw Error('Letters need some height.');
  const V={X:[],Y:[],Z:[]},faces=[];
  if(backing==='letters'){
   const top=hInk,lo=L.map(l=>addCopy(V,l,0)),hi=L.map(l=>addCopy(V,l,top));
   triangulate(L,hi,true,faces,V.X,V.Y,V.Z,top,spacing);triangulate(L,lo,false,faces,V.X,V.Y,V.Z,0,spacing);L.forEach((l,k)=>walls(lo[k],hi[k],V.X,V.Y,false,faces));
  }else{
   const bBot=B.map(l=>addCopy(V,l,0)),bTop=B.map(l=>addCopy(V,l,hBg)),lBg=L.map(l=>addCopy(V,l,hBg)),lInk=L.map(l=>addCopy(V,l,hInk));
   triangulate([...B,...L],[...bTop,...lBg],true,faces,V.X,V.Y,V.Z,hBg,spacing);triangulate(L,lInk,true,faces,V.X,V.Y,V.Z,hInk,spacing);triangulate(B,bBot,false,faces,V.X,V.Y,V.Z,0,spacing);
   B.forEach((l,k)=>walls(bBot[k],bTop[k],V.X,V.Y,false,faces));
   // Wall faces point from the higher side to the lower one: away from raised letters, into carved ones.
   L.forEach((l,k)=>hInk<hBg?walls(lInk[k],lBg[k],V.X,V.Y,true,faces):walls(lBg[k],lInk[k],V.X,V.Y,false,faces));
  }
  const F=faces;
  // (X, Y, Z) -> (x, y, z) = (X, Z, Y) mirrors handedness, so every face is reversed to keep normals outward.
  const n=V.X.length,positions=new Float32Array(n*3);for(let i=0;i<n;i++){positions[i*3]=V.X[i];positions[i*3+1]=V.Z[i];positions[i*3+2]=V.Y[i]}
  const indices=new Array(F.length);for(let f=0;f<F.length;f+=3){indices[f]=F[f];indices[f+1]=F[f+2];indices[f+2]=F[f+1]}
  if(o.curveEnable)MC.curlPositions(positions,width,depth,o.curveDirection||'horizontal',Math.max(1,+o.curveRadius||50),+o.curveAngle||0,+o.curveFalloff||0);
  check(positions,indices,MC);
  const pieces=backing==='letters'?L.filter((l,i)=>area(l)>0).length:B.filter(l=>area(l)>0).length;
  return {positions,indices,textRelief:true,info:{pieces,outlinePoints:L.reduce((s,l)=>s+l.length/2,0)}};
 }
 // Point spacing on bent surfaces: chord sagitta about 0.01 mm (s^2 / 8R), coarsened so the faces stay in budget.
 function curveSpacing(areaMm2,radius){let s=Math.min(4,Math.max(.3,Math.sqrt(8*radius*.01)));const est=2*areaMm2/(.43*s*s);if(est>faceCap*.5)s*=Math.sqrt(est/(faceCap*.5));return s}

 // Parametric sleeve and Logo only: the outer surface is built from the outlines in the unrolled (column, height)
 // domain and handed to MeshCore.buildSleeve, which adds the cavity, rims, cap and side walls exactly as before.
 function buildSleeve(o,MC){
  const t=o.textRelief;
  const outer=(ctx)=>{
   const {rows,cols,isFullWrap,colMax,thetaAt,innerR,wall,sleeveHeight,logoOnly,negative,maxHeight,minShell}=ctx;
   const offset=relief=>logoOnly?(negative?Math.max(wall+minShell*.5,wall+minShell-relief):wall+Math.max(relief,minShell)):negative?wall+maxHeight-relief:wall+relief;
   const inkH=t.inkHigh===false?0:maxHeight,zBg=offset(maxHeight-inkH),zInk=offset(inkH);if(!(Math.abs(zInk-zBg)>=.005))throw Error('Lettering needs some depth.');
   // Domain: X = column * colW (roughly millimetres around the sleeve), Y = height.
   let arc=0;const steps=256;for(let s=0;s<steps;s++){const a=thetaAt(s/steps*colMax),b=thetaAt((s+1)/steps*colMax),ra=innerR(a)+wall,rb=innerR(b)+wall;arc+=Math.hypot(rb*Math.cos(b)-ra*Math.cos(a),rb*Math.sin(b)-ra*Math.sin(a))}
   const colW=arc/colMax,fx=u=>u*(cols-1)*colW,fy=v=>(1-v)*sleeveHeight,X0=0,X1=colMax*colW;
   let rMin=Infinity;for(let s=0;s<=64;s++)rMin=Math.min(rMin,innerR(thetaAt(s/64*colMax))+wall);
   const spacing=curveSpacing(X1*sleeveHeight,rMin);
   const L=orient(cleanAll(mapLoops(t.loops||[],fx,fy),1e-4)).map(l=>densify(l,spacing));if(!L.length)throw Error('No lettering outline found.');
   for(const l of L)for(let i=0;i<l.length;i+=2)if(!(l[i]>X0+1e-3&&l[i]<X1-1e-3&&l[i+1]>1e-3&&l[i+1]<sleeveHeight-1e-3))throw Error('Lettering reaches the sleeve edge.');
   const V={X:[],Y:[],Z:[]},faces=[],bIndex=new Map(),bKey=(i,j)=>i*(cols+2)+j,rect=[],rectIds=[];
   const addB=(i,j)=>{const id=V.X.length;V.X.push(j*colW);V.Y.push(i/(rows-1)*sleeveHeight);V.Z.push(zBg);bIndex.set(bKey(i,j),id);rect.push(j*colW,i/(rows-1)*sleeveHeight);rectIds.push(id)};
   for(let j=0;j<colMax;j++)addB(0,j);for(let i=0;i<rows-1;i++)addB(i,colMax);for(let j=colMax;j>0;j--)addB(rows-1,j);for(let i=rows-1;i>0;i--)addB(i,0);
   const R=Float64Array.from(rect),lBg=L.map(l=>addCopy(V,l,zBg)),lInk=L.map(l=>addCopy(V,l,zInk));
   triangulate([R,...L],[Int32Array.from(rectIds),...lBg],true,faces,V.X,V.Y,V.Z,zBg,spacing);triangulate(L,lInk,true,faces,V.X,V.Y,V.Z,zInk,spacing);
   L.forEach((l,k)=>zInk<zBg?walls(lInk[k],lBg[k],V.X,V.Y,true,faces):walls(lBg[k],lInk[k],V.X,V.Y,false,faces));
   const F=faces;
   // Full wrap: the right edge (column cols) is the left edge (column 0).
   const merge=new Int32Array(V.X.length).map((_,i)=>i);if(isFullWrap)for(let i=0;i<rows;i++)merge[bIndex.get(bKey(i,colMax))]=bIndex.get(bKey(i,0));
   const used=new Int32Array(V.X.length).fill(-1),P=[];let count=0;const out=new Array(F.length);
   for(let f=0;f<F.length;f+=3)for(let e=0;e<3;e++){const v=merge[F[f+e]];if(used[v]<0){used[v]=count++;const theta=thetaAt(V.X[v]/colW),r=innerR(theta)+V.Z[v];P.push(r*Math.cos(theta),V.Y[v],r*Math.sin(theta))}out[f+(e===0?0:3-e)]=used[v]}
   for(let f=0;f<out.length;f+=3)if(out[f]===out[f+1]||out[f+1]===out[f+2]||out[f]===out[f+2])throw Error('Lettering mesh collapsed at the seam.');
   const oIdx=(i,j)=>{const id=bIndex.get(bKey(i,j));if(id===undefined)throw Error('Sleeve rim vertex missing.');return used[merge[id]]};
   return {positions:P,indices:out,oIdx,info:{outlinePoints:L.reduce((s,l)=>s+l.length/2,0)}};
  };
  let info=null,outerFaces=0;const mesh=MC.buildSleeve({...o,textOuter:ctx=>{const r=outer(ctx);info=r.info;outerFaces=r.indices.length;return r},logoOnly:o.mode==='logo-only'});
  const positions=toFloat(mesh.positions);check(positions,mesh.indices,MC,o.capBottom&&+o.capHole>=.1?outerFaces:mesh.indices.length);
  return {positions,indices:mesh.indices,textRelief:true,info};
 }

 // Display normals with hard creases: a corner averages only the incident faces within `angleDeg` of its own face,
 // so letter walls meet the top at a crisp edge while curved surfaces stay smooth. Returns non-indexed arrays.
 function creasedNormals(positions,indices,angleDeg=35){
  const nf=indices.length/3,fn=new Float32Array(nf*3),nv=positions.length/3,cosT=Math.cos(angleDeg*Math.PI/180);
  for(let f=0;f<nf;f++){const a=indices[3*f]*3,b=indices[3*f+1]*3,c=indices[3*f+2]*3,ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];fn[3*f]=uy*vz-uz*vy;fn[3*f+1]=uz*vx-ux*vz;fn[3*f+2]=ux*vy-uy*vx}
  // Incident faces per vertex (CSR).
  const start=new Int32Array(nv+1);for(let i=0;i<indices.length;i++)start[indices[i]+1]++;for(let v=0;v<nv;v++)start[v+1]+=start[v];
  const fill=start.slice(0,nv),inc=new Int32Array(indices.length);for(let i=0;i<indices.length;i++)inc[fill[indices[i]]++]=(i/3)|0;
  const unit=new Float32Array(nf*3);for(let f=0;f<nf;f++){const l=Math.hypot(fn[3*f],fn[3*f+1],fn[3*f+2])||1;unit[3*f]=fn[3*f]/l;unit[3*f+1]=fn[3*f+1]/l;unit[3*f+2]=fn[3*f+2]/l}
  const position=new Float32Array(indices.length*3),normal=new Float32Array(indices.length*3);
  for(let i=0;i<indices.length;i++){const f=(i/3)|0,v=indices[i];let x=0,y=0,z=0;
   for(let k=start[v];k<start[v+1];k++){const g=inc[k];if(unit[3*f]*unit[3*g]+unit[3*f+1]*unit[3*g+1]+unit[3*f+2]*unit[3*g+2]>=cosT){x+=fn[3*g];y+=fn[3*g+1];z+=fn[3*g+2]}}
   const l=Math.hypot(x,y,z)||1;normal[3*i]=x/l;normal[3*i+1]=y/l;normal[3*i+2]=z/l;position[3*i]=positions[3*v];position[3*i+1]=positions[3*v+1];position[3*i+2]=positions[3*v+2]}
  return {position,normal};
 }

 function build(o,MC){
  if(!o||!o.textRelief||!Array.isArray(o.textRelief.loops))throw Error('No lettering outline.');
  const requested=+o.textRelief.maxFaces,cap=Number.isFinite(requested)&&requested>=10000?Math.min(MAX_FACES,requested):MAX_FACES;
  const prev=faceCap;faceCap=cap;
  try{return o.mode==='flat'?buildFlat(o,MC):buildSleeve(o,MC);}
  finally{faceCap=prev;}
 }

 root.TextRelief={trace,simplify,clean,prepare,intersecting,area,distanceField,offsetOutline,nesting,triangulate,densify,build,buildFlat,buildSleeve,check,creasedNormals};
})(typeof globalThis!=='undefined'?globalThis:self);
