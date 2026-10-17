'use strict';
globalThis.SharpSleeve=(()=>{
 // Numeric undirected edge key (vertex ids stay far below 2^26, so the key is an exact integer).
 const key=(a,b)=>a<b?a*67108864+b:b*67108864+a;
 // Growable open-addressing map from an ordered pair of non-negative int32 ids to an int32 value (-1 = absent).
 // Far faster than a Map with string or large-number keys on million-edge meshes.
 function pairTable(expected){
  let size=16,count=0;while(size<expected*2.5)size*=2;let mask=size-1,ka=new Int32Array(size),kb=new Int32Array(size),values=new Int32Array(size).fill(-1);
  const slot=(a,b)=>{let h=Math.imul(a,-1640531535)+b|0;h^=h>>>16;h=Math.imul(h,-2048144789);h^=h>>>13;h=Math.imul(h,-1028477387);h=(h^h>>>16)&mask;for(;;){if(values[h]<0||(ka[h]===a&&kb[h]===b))return h;h=(h+1)&mask}};
  const grow=()=>{const oa=ka,ob=kb,ov=values;size*=2;mask=size-1;ka=new Int32Array(size);kb=new Int32Array(size);values=new Int32Array(size).fill(-1);for(let i=0;i<ov.length;i++)if(ov[i]>=0){const h=slot(oa[i],ob[i]);ka[h]=oa[i];kb[h]=ob[i];values[h]=ov[i]}};
  return{get(a,b){return values[slot(a,b)]},set(a,b,v){let h=slot(a,b);if(values[h]<0){if(++count>size*.5){grow();h=slot(a,b)}ka[h]=a;kb[h]=b}values[h]=v},clear(){values.fill(-1);count=0},get size(){return count}};
 }
 // Interpolate distance to the silhouette, not saturated alpha. Binary alpha
 // gives every crossed mesh edge a midpoint, creating mesh-sized sawteeth.
 // ---- Vector outlines -------------------------------------------------------------------------------------------
 // Raster artwork (often an enlarged, hard-edged source) gives pixel staircases that the mesh reproduces faithfully.
 // Sharp designs therefore trace the outline (marching squares), replace each staircase by the smooth curve it
 // approximates (smoothLoop: corners kept, scale = one source pixel) and build an exact signed distance field to
 // the smooth outlines (vectorField). Strokes thinner than minStroke are widened so they stay continuous.
 // Outlines are traced slightly below half coverage: an upscaled 1-pixel line whose pixels touch only at corners
 // reaches exactly 0.5 at each touch point, so at 0.5 it falls apart into dashes; at 0.45 it stays one stroke
 // (edges of wider shapes move outward by only 1/20 of a source pixel).
 const INK_LEVEL=.45;
 function traceLoops(hm,cols,rows,dx,dy,level=.5){
  const W=cols+2,value=(x,y)=>x<0||y<0||x>=cols||y>=rows?0:hm[y*cols+x],points=new Map(),next=new Map();
  const point=(id,x0,y0,x1,y1)=>{if(!points.has(id)){const a=value(x0,y0),b=value(x1,y1),t=Math.max(0,Math.min(1,(level-a)/(b-a)));points.set(id,[(x0+(x1-x0)*t)*dx,(y0+(y1-y0)*t)*dy])}return id};
  for(let y=-1;y<rows;y++)for(let x=-1;x<cols;x++){
   const a=value(x,y)>level,b=value(x+1,y)>level,c=value(x+1,y+1)>level,d=value(x,y+1)>level;if(a===b&&b===c&&c===d)continue;
   // Corners clockwise (image y down): a top-left, b top-right, c bottom-right, d bottom-left; edges a-b, b-c, c-d, d-a.
   const ins=[a,b,c,d],edge=[()=>point(((y+1)*W+x+1)*2,x,y,x+1,y),()=>point(((y+1)*W+x+2)*2+1,x+1,y,x+1,y+1),()=>point(((y+2)*W+x+1)*2,x,y+1,x+1,y+1),()=>point(((y+1)*W+x+1)*2+1,x,y,x,y+1)];
   const enter=[],exit=[];for(let k=0;k<4;k++){const p=ins[k],q=ins[(k+1)%4];if(!p&&q)enter.push(k);else if(p&&!q)exit.push(k)}
   if(enter.length===1)next.set(edge[enter[0]](),edge[exit[0]]());
   else{// Saddle: the cell centre decides whether the two inside corners connect.
    const centre=(value(x,y)+value(x+1,y)+value(x+1,y+1)+value(x,y+1))/4>level;
    // exit[i] closes the inside run that starts at enter[i] when inside corners stay separate.
    for(const k of enter){const own=exit.reduce((best,e)=>((e-k+4)%4)<((best-k+4)%4)?e:best),other=exit.find(e=>e!==own);next.set(edge[k](),edge[centre?other:own]())}
   }
  }
  const loops=[],seen=new Set();
  for(const start of next.keys()){if(seen.has(start))continue;const loop=[];let id=start;while(id!==undefined&&!seen.has(id)){seen.add(id);loop.push(points.get(id));id=next.get(id)}if(loop.length>=3)loops.push(loop)}
  return loops;
 }
 function simplifyLoop(loop,tol){
  const n=loop.length;if(n<8)return loop;const d2=(p,a,b)=>{const vx=b[0]-a[0],vy=b[1]-a[1],l=vx*vx+vy*vy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vy)/l)):0,ex=a[0]+vx*t-p[0],ey=a[1]+vy*t-p[1];return ex*ex+ey*ey};
  let far=0,best=-1;for(let i=1;i<n;i++){const e=(loop[i][0]-loop[0][0])**2+(loop[i][1]-loop[0][1])**2;if(e>best){best=e;far=i}}
  const keep=new Uint8Array(n);keep[0]=keep[far]=1;const stack=[[0,far],[far,n]],t2=tol*tol;
  while(stack.length){const[s,e]=stack.pop();const a=loop[s],b=loop[e%n];let m=-1,md=t2;for(let i=s+1;i<e;i++){const v=d2(loop[i],a,b);if(v>md){md=v;m=i}}if(m>=0){keep[m]=1;stack.push([s,m],[m,e])}}
  const out=[];for(let i=0;i<n;i++)if(keep[i])out.push(loop[i]);return out.length>=3?out:loop;
 }
 // Staircase removal (Potrace-style). The traced outline is resampled, true corners are found at a scale of two
 // source pixels, and every run between corners is split into the fewest pieces that stay within half a source
 // pixel of the lightly smoothed trace. Each piece gets a least-squares line (a staircase becomes its centre line),
 // neighbouring lines meet at polygon vertices, and corner-preserving Chaikin rounds the polygon into a smooth
 // curve tangent to each line at its middle. Corners stay sharp at the intersection of their two lines.
 function smoothLoop(loop,sourcePixel,step){
  const n0=loop.length;let perimeter=0;const cum=new Float64Array(n0+1);for(let i=0;i<n0;i++){const a=loop[i],b=loop[(i+1)%n0];perimeter+=Math.hypot(b[0]-a[0],b[1]-a[1]);cum[i+1]=perimeter}
  if(n0<4||!(perimeter>0))return loop;const n=Math.max(8,Math.round(perimeter/step)),h=perimeter/n,X=new Float64Array(n),Y=new Float64Array(n),at=i=>(i%n+n)%n;
  for(let i=0,j=0;i<n;i++){const s=i*h;while(j<n0-1&&cum[j+1]<s)j++;const a=loop[j],b=loop[(j+1)%n0],l=cum[j+1]-cum[j],t=l>0?(s-cum[j])/l:0;X[i]=a[0]+(b[0]-a[0])*t;Y[i]=a[1]+(b[1]-a[1])*t}
  // Light Gaussian (sigma half a source pixel) so piece boundaries do not snap to individual stair corners.
  const sigma=Math.min(.5*sourcePixel,perimeter/16)/h,SX=new Float64Array(n),SY=new Float64Array(n);
  if(sigma>=.5){const r=Math.ceil(3*sigma),w=[];let norm=0;for(let j=-r;j<=r;j++){w.push(Math.exp(-j*j/(2*sigma*sigma)));norm+=w[w.length-1]}for(let i=0;i<n;i++){let sx=0,sy=0;for(let j=-r;j<=r;j++){const q=at(i+j),c=w[j+r];sx+=X[q]*c;sy+=Y[q]*c}SX[i]=sx/norm;SY[i]=sy/norm}}else{SX.set(X);SY.set(Y)}
  if(perimeter<6*sourcePixel)return Array.from(SX,(x,i)=>[x,SY[i]]);
  // Corners: turning angle between chords to +-k samples, local maxima above 45 degrees (on the raw trace).
  const k=Math.max(2,Math.round(2*sourcePixel/h)),corners=[];
  if(n>4*k){const turn=new Float64Array(n);for(let i=0;i<n;i++){const a=at(i-k),b=at(i+k),ux=X[i]-X[a],uy=Y[i]-Y[a],vx=X[b]-X[i],vy=Y[b]-Y[i],l=Math.hypot(ux,uy)*Math.hypot(vx,vy);turn[i]=l>0?Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/l))):0}
   // A corner concentrates its turn: at half the scale (on the lightly smoothed trace) it keeps most of it, while a
   // curve's turn halves. This keeps small circles free of false corners but catches pixel-chopped square corners.
   const half=Math.max(1,k>>1),turnHalf=i=>{const a=at(i-half),b=at(i+half),ux=SX[i]-SX[a],uy=SY[i]-SY[a],vx=SX[b]-SX[i],vy=SY[b]-SY[i],l=Math.hypot(ux,uy)*Math.hypot(vx,vy);return l>0?Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/l))):0};
   for(let i=0;i<n;i++){if(turn[i]<45*Math.PI/180)continue;let peak=true;for(let j=1;j<=k&&peak;j++)if(turn[at(i+j)]>turn[i]||turn[at(i-j)]>=turn[i])peak=false;if(peak&&turnHalf(i)>=.55*turn[i])corners.push(i)}}
  const isCorner=new Uint8Array(n);for(const c of corners)isCorner[c]=1;
  // Forced breakpoints: corners, or (no corners) sample 0 and the sample farthest from it.
  let forced=corners.slice();if(forced.length<2){let far=0,best=-1;const s0=forced.length?forced[0]:0;for(let i=0;i<n;i++){const e=(SX[i]-SX[s0])**2+(SY[i]-SY[s0])**2;if(e>best){best=e;far=i}}forced=[...new Set([s0,far])].sort((a,b)=>a-b)}
  const tol=.5*sourcePixel,t2=tol*tol,breaks=new Set(forced);
  for(let q=0;q<forced.length;q++){const s=forced[q],e=forced[(q+1)%forced.length]+(q+1===forced.length?n:0),stack=[[s,e]];
   while(stack.length){const [a,b]=stack.pop();const ax=SX[at(a)],ay=SY[at(a)],vx=SX[at(b)]-ax,vy=SY[at(b)]-ay,l=vx*vx+vy*vy;let m=-1,md=t2;
    for(let i=a+1;i<b;i++){const px=SX[at(i)]-ax,py=SY[at(i)]-ay,t=l?Math.max(0,Math.min(1,(px*vx+py*vy)/l)):0,ex=px-vx*t,ey=py-vy*t,d=ex*ex+ey*ey;if(d>md){md=d;m=i}}
    if(m>=0){breaks.add(at(m));stack.push([a,m],[m,b])}}}
  const B=[...breaks].sort((a,b)=>a-b),nb=B.length;if(nb<3)return Array.from(SX,(x,i)=>[x,SY[i]]);
  // Least-squares line per piece (samples between consecutive breakpoints, inclusive).
  const lines=[];for(let q=0;q<nb;q++){const s=B[q],e=B[(q+1)%nb]+(q+1===nb?n:0);let mx=0,my=0,c=0;for(let i=s;i<=e;i++){mx+=SX[at(i)];my+=SY[at(i)];c++}mx/=c;my/=c;let xx=0,xy=0,yy=0;for(let i=s;i<=e;i++){const ex=SX[at(i)]-mx,ey=SY[at(i)]-my;xx+=ex*ex;xy+=ex*ey;yy+=ey*ey}const a=.5*Math.atan2(2*xy,xx-yy);lines.push([mx,my,Math.cos(a),Math.sin(a)])}
  const V=[],flags=[];for(let q=0;q<nb;q++){const [ax,ay,au,av]=lines[(q-1+nb)%nb],[bx,by,bu,bv]=lines[q],i=B[q],px=SX[i],py=SY[i],det=au*bv-av*bu;let p=null;
   if(Math.abs(det)>.05){const t=((bx-ax)*bv-(by-ay)*bu)/det,x=ax+au*t,y=ay+av*t;if(Math.hypot(x-px,y-py)<(isCorner[i]?1.5:1)*sourcePixel)p=[x,y]}
   if(!p){const pa=(px-ax)*au+(py-ay)*av,pb=(px-bx)*bu+(py-by)*bv;p=[(ax+au*pa+bx+bu*pb)/2,(ay+av*pa+by+bv*pb)/2]}
   V.push(p);flags.push(!!isCorner[i])}
  let pts=V,corner=flags;
  for(let it=0;it<4;it++){const out=[],f=[],m=pts.length;for(let i=0;i<m;i++){const p=pts[i],q=pts[(i+1)%m];if(corner[i]){out.push(p);f.push(true)}out.push([p[0]*.75+q[0]*.25,p[1]*.75+q[1]*.25],[p[0]*.25+q[0]*.75,p[1]*.25+q[1]*.75]);f.push(false,false)}pts=out;corner=f}
  return keepArea(smoothRuns(pts,corner,1.5*sourcePixel,step),X,Y,.5*sourcePixel);
 }
 // Corner cutting pulls curves inward (and would thin strokes): offset the smooth loop along its normals so it
 // encloses the same area as the traced one (the staircase's area is the shape's area).
 function keepArea(pts,X,Y,limit){
  const area=(n,x,y)=>{let a=0;for(let i=0;i<n;i++){const j=(i+1)%n;a+=x(i)*y(j)-x(j)*y(i)}return a/2};
  const m=pts.length;if(m<3)return pts;const a0=area(X.length,i=>X[i],i=>Y[i]),a1=area(m,i=>pts[i][0],i=>pts[i][1]);let perimeter=0;for(let i=0;i<m;i++){const p=pts[i],q=pts[(i+1)%m];perimeter+=Math.hypot(q[0]-p[0],q[1]-p[1])}
  if(!(perimeter>0)||Math.sign(a0)!==Math.sign(a1))return pts;const d=Math.max(-limit,Math.min(limit,(Math.abs(a0)-Math.abs(a1))/perimeter)),s=Math.sign(a1);
  return pts.map((p,i)=>{const a=pts[(i-1+m)%m],b=pts[(i+1)%m],tx=b[0]-a[0],ty=b[1]-a[1],l=Math.hypot(tx,ty)||1;return[p[0]+d*s*ty/l,p[1]-d*s*tx/l]});
 }
 // Even out the curvature of the rounded polygon (a B-spline bulges near its vertices): Gaussian smoothing along
 // each corner-to-corner run, resampled uniformly, ends fixed with odd reflection so straight pieces stay straight.
 function smoothRuns(pts,corner,sigmaLength,step){
  const m=pts.length,cs=[];for(let i=0;i<m;i++)if(corner[i])cs.push(i);const closed=!cs.length,runs=[];
  if(closed)runs.push([...pts,pts[0]]);else for(let q=0;q<cs.length;q++){const s=cs[q],e=cs[(q+1)%cs.length]+(q+1===cs.length?m:0),run=[];for(let i=s;i<=e;i++)run.push(pts[i%m]);runs.push(run)}
  const out=[];
  for(const run of runs){let length=0;const cum=[0];for(let i=1;i<run.length;i++){length+=Math.hypot(run[i][0]-run[i-1][0],run[i][1]-run[i-1][1]);cum.push(length)}
   const n=Math.max(2,Math.round(length/step)),h=length/n,X=new Float64Array(n+1),Y=new Float64Array(n+1);
   for(let i=0,j=0;i<=n;i++){const s=Math.min(length,i*h);while(j<run.length-2&&cum[j+1]<s)j++;const l=cum[j+1]-cum[j],t=l>0?(s-cum[j])/l:0;X[i]=run[j][0]+(run[j+1][0]-run[j][0])*t;Y[i]=run[j][1]+(run[j+1][1]-run[j][1])*t}
   const sigma=Math.min(sigmaLength,length/(closed?8:4))/h,r=Math.ceil(3*sigma);
   if(!(sigma>=.5)){for(let i=0;i<n;i++)out.push([X[i],Y[i]]);continue}
   const w=new Float64Array(r+1);let norm=0;for(let j=0;j<=r;j++){w[j]=Math.exp(-j*j/(2*sigma*sigma));norm+=j?2*w[j]:w[j]}
   const blur=(U,V)=>{const OU=new Float64Array(n+1),OV=new Float64Array(n+1),get=closed?(i=>{const k=((i%n)+n)%n;return[U[k],V[k]]}):(i=>{if(i<0){const k=Math.min(n,-i);return[2*U[0]-U[k],2*V[0]-V[k]]}if(i>n){const k=Math.max(0,2*n-i);return[2*U[n]-U[k],2*V[n]-V[k]]}return[U[i],V[i]]});
    for(let i=0;i<=n;i++){let sx=U[i]*w[0],sy=V[i]*w[0];for(let j=1;j<=r;j++){const a=get(i-j),b=get(i+j);sx+=(a[0]+b[0])*w[j];sy+=(a[1]+b[1])*w[j]}OU[i]=sx/norm;OV[i]=sy/norm}if(!closed){OU[0]=U[0];OV[0]=V[0];OU[n]=U[n];OV[n]=V[n]}return[OU,OV]};
   // 2G - G*G: removes the bumps like a Gaussian but cancels its shrinking of curves to second order.
   const [SX,SY]=blur(X,Y),[TX,TY]=blur(SX,SY);
   for(let i=0;i<n;i++)out.push([2*SX[i]-TX[i],2*SY[i]-TY[i]])}
  return out;
 }
 function vectorField(o){
  const {cols,rows,heightmap:hm}=o,dx=o.designWidth/(cols-1),dy=o.designHeight/(rows-1),unit=Math.min(dx,dy),pixel=Math.max(dx,dy);
  const sourcePixel=pixel*Math.max(1,Number(o.sourceScale)||1),minHalf=Math.max(0,Number(o.minStroke??.3)||0)/2;
  // Minimum line width: centre lines of strokes thinner than minStroke (ridges of the pixel distance field whose
  // sides fall away at full slope, which excludes shape corners) are widened to minStroke in the map itself, so
  // the widened strokes are traced and smoothed like any other outline.
  let map=hm;
  if(minHalf>0){const pf=pixelField(o,INK_LEVEL),fv=k=>(pf[k]-.5)*unit,axes=[[1,0],[0,1],[1,1],[1,-1]].map(([ax,ay])=>{const L=Math.hypot(ax*dx,ay*dy);return{ax,ay,L,ux:ax*dx/L,uy:ay*dy/L}}),ridges=[];
   for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){const k=y*cols+x,f0=fv(k);if(!(f0>0&&f0<minHalf))continue;let best=null;
    for(const a of axes){const fl=fv(k-a.ay*cols-a.ax),fr=fv(k+a.ay*cols+a.ax);if(!(f0>=fl&&f0>=fr))continue;const c=Math.max(f0-fl,f0-fr)/a.L;if(c>.85&&(!best||c>best.c))best={c,a,fl,fr}}
    if(best){const delta=Math.max(-.5,Math.min(.5,(best.fr-best.fl)/(2*best.c*best.a.L)))*best.a.L;ridges.push(x*dx+best.a.ux*delta,y*dy+best.a.uy*delta)}}
   if(ridges.length){map=Float32Array.from(hm);const ramp=2*unit,rx=Math.ceil((minHalf+ramp)/dx)+1,ry=Math.ceil((minHalf+ramp)/dy)+1;
    for(let i=0;i<ridges.length;i+=2){const px=ridges[i],py=ridges[i+1],cx=Math.round(px/dx),cy=Math.round(py/dy);
     for(let y=Math.max(0,cy-ry);y<=Math.min(rows-1,cy+ry);y++)for(let x=Math.max(0,cx-rx);x<=Math.min(cols-1,cx+rx);x++){const ex=x*dx-px,ey=y*dy-py,v=INK_LEVEL+(minHalf-Math.sqrt(ex*ex+ey*ey))/ramp,k=y*cols+x;if(v>map[k])map[k]=Math.min(1,v)}}}}
  const loops=traceLoops(map,cols,rows,dx,dy,INK_LEVEL).map(loop=>simplifyLoop(smoothLoop(loop,sourcePixel,unit*.5),unit*.05));
  const n=cols*rows,dist=new Float32Array(n).fill(Infinity),band=3*pixel+minHalf;
  let inkSign=1,largest=0;for(const loop of loops){let area=0;for(let i=0;i<loop.length;i++){const p=loop[i],q=loop[(i+1)%loop.length];area+=p[0]*q[1]-q[0]*p[1]}if(Math.abs(area)>largest){largest=Math.abs(area);inkSign=area>0?1:-1}}
  // Exact distance to the smooth outline in a narrow band.
  for(const loop of loops)for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length],vx=b[0]-a[0],vy=b[1]-a[1],l=vx*vx+vy*vy;
   const x0=Math.max(0,Math.floor((Math.min(a[0],b[0])-band)/dx)),x1=Math.min(cols-1,Math.ceil((Math.max(a[0],b[0])+band)/dx)),y0=Math.max(0,Math.floor((Math.min(a[1],b[1])-band)/dy)),y1=Math.min(rows-1,Math.ceil((Math.max(a[1],b[1])+band)/dy));
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const px=x*dx-a[0],py=y*dy-a[1],t=l?Math.max(0,Math.min(1,(px*vx+py*vy)/l)):0,ex=px-vx*t,ey=py-vy*t,e=Math.sqrt(ex*ex+ey*ey),k=y*cols+x;if(e<dist[k])dist[k]=e}}
  // Inside by winding number of the smooth loops: smoothing can make neighbouring outlines (two strokes meeting
  // at a pixel corner) overlap slightly, and their union must stay filled. Outlines run clockwise on screen around
  // ink and counter-clockwise around holes (marching squares orientation), so ink has positive winding.
  const inside=new Uint8Array(n),cross=Array.from({length:rows},()=>[]);
  for(const loop of loops)for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];if(a[1]===b[1])continue;const lo=Math.min(a[1],b[1]),hi=Math.max(a[1],b[1]),dir=b[1]>a[1]?1:-1;for(let y=Math.max(0,Math.ceil(lo/dy));y<rows&&y*dy<hi;y++){const Y=y*dy;if(Y<lo)continue;cross[y].push(a[0]+(b[0]-a[0])*(Y-a[1])/(b[1]-a[1]),dir)}}
  const order=[];for(let y=0;y<rows;y++){const c=cross[y];if(!c.length)continue;order.length=0;for(let j=0;j<c.length;j+=2)order.push(j);order.sort((p,q)=>c[p]-c[q]);let wind=0;
   for(let m=0;m+1<order.length;m++){wind-=c[order[m]+1]*inkSign;if(wind>0)for(let x=Math.max(0,Math.ceil(c[order[m]]/dx));x<cols&&x*dx<c[order[m+1]];x++)inside[y*cols+x]=1}}
  // Tracing below 0.5 moved edges outward by (0.5-INK_LEVEL) of the edge ramp (one source pixel); move them back.
  const bias=(.5-INK_LEVEL)*sourcePixel;
  const f=new Float32Array(n);for(let k=0;k<n;k++)f[k]=dist[k]<=band?(inside[k]?dist[k]:-dist[k])-bias:NaN;
  // Smoothing narrows thin strokes again (and rounds off their ends), so the minimum width is enforced once more
  // on the exact field: ridge points of the smooth outline's distance carry discs of radius minHalf.
  if(minHalf>0){const axes=[[1,0],[0,1],[1,1],[1,-1]].map(([ax,ay])=>{const L=Math.hypot(ax*dx,ay*dy);return{ax,ay,L,ux:ax*dx/L,uy:ay*dy/L}}),ridges=[];
   for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){const k=y*cols+x,f0=f[k];if(!(f0>0&&f0<minHalf))continue;let best=null;
    for(const a of axes){const fl=f[k-a.ay*cols-a.ax],fr=f[k+a.ay*cols+a.ax];if(!(f0>=fl&&f0>=fr))continue;const c=Math.max(f0-fl,f0-fr)/a.L;if(c>.85&&(!best||c>best.c))best={c,a,fl,fr}}
    if(best){const delta=Math.max(-.5,Math.min(.5,(best.fr-best.fl)/(2*best.c*best.a.L)))*best.a.L;ridges.push(x*dx+best.a.ux*delta,y*dy+best.a.uy*delta)}}
   const rx=Math.ceil(minHalf/dx)+1,ry=Math.ceil(minHalf/dy)+1;
   for(let i=0;i<ridges.length;i+=2){const px=ridges[i],py=ridges[i+1],cx=Math.round(px/dx),cy=Math.round(py/dy);
    for(let y=Math.max(0,cy-ry);y<=Math.min(rows-1,cy+ry);y++)for(let x=Math.max(0,cx-rx);x<=Math.min(cols-1,cx+rx);x++){const ex=x*dx-px,ey=y*dy-py,v=minHalf-Math.sqrt(ex*ex+ey*ey),k=y*cols+x;if(v>-pixel&&(Number.isNaN(f[k])||v>f[k]))f[k]=v}}}
  // Outside the band: chamfer distances from the band, signed by the fill.
  const d=new Float32Array(n),diag=Math.hypot(dx,dy);for(let k=0;k<n;k++)d[k]=Number.isNaN(f[k])?1e6:Math.abs(f[k]);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=y*cols+x;let v=d[i];if(x)v=Math.min(v,d[i-1]+dx);if(y){v=Math.min(v,d[i-cols]+dy);if(x)v=Math.min(v,d[i-cols-1]+diag);if(x+1<cols)v=Math.min(v,d[i-cols+1]+diag)}d[i]=v}
  for(let y=rows-1;y>=0;y--)for(let x=cols-1;x>=0;x--){const i=y*cols+x;let v=d[i];if(x+1<cols)v=Math.min(v,d[i+1]+dx);if(y+1<rows){v=Math.min(v,d[i+cols]+dy);if(x)v=Math.min(v,d[i+cols-1]+diag);if(x+1<cols)v=Math.min(v,d[i+cols+1]+diag)}d[i]=v}
  for(let k=0;k<n;k++){const s=Number.isNaN(f[k])?(inside[k]?1:-1):Math.sign(f[k])||-1;d[k]=.5+s*(Number.isNaN(f[k])?d[k]:Math.abs(f[k]))/unit;if(Math.abs(d[k]-.5)<1e-6)d[k]=d[k]>=.5?.500001:.499999}
  return d;
 }
 function contourField(o){return o.smoothContours!==false&&o.heightmap.some(v=>v>.5)?vectorField(o):pixelField(o)}
 // Pixel outline (the original field, still used for smooth-relief designs): distance to the level crossing on
 // grid edges, propagated by a chamfer transform.
 function pixelField(o,level=.5){
  const {cols,rows,heightmap}=o,dx=o.designWidth/(cols-1),dy=o.designHeight/(rows-1),diag=Math.hypot(dx,dy),d=new Float32Array(cols*rows);d.fill(1e6);
  const inside=i=>heightmap[i]>level;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
   const i=y*cols+x,a=heightmap[i];
   if(inside(i))d[i]=Math.min(d[i],(x+.5)*dx,(cols-x-.5)*dx,(y+.5)*dy,(rows-y-.5)*dy);
   for(const [j,step]of[[x+1<cols?i+1:-1,dx],[y+1<rows?i+cols:-1,dy]])if(j>=0&&inside(i)!==inside(j)){
    const t=Math.abs((level-a)/(heightmap[j]-a));d[i]=Math.min(d[i],t*step);d[j]=Math.min(d[j],(1-t)*step);
   }
  }
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=y*cols+x;let v=d[i];if(x)v=Math.min(v,d[i-1]+dx);if(y){v=Math.min(v,d[i-cols]+dy);if(x)v=Math.min(v,d[i-cols-1]+diag);if(x+1<cols)v=Math.min(v,d[i-cols+1]+diag)}d[i]=v}
  for(let y=rows-1;y>=0;y--)for(let x=cols-1;x>=0;x--){const i=y*cols+x;let v=d[i];if(x+1<cols)v=Math.min(v,d[i+1]+dx);if(y+1<rows){v=Math.min(v,d[i+cols]+dy);if(x)v=Math.min(v,d[i+cols-1]+diag);if(x+1<cols)v=Math.min(v,d[i+cols+1]+diag)}d[i]=v}
  for(let i=0;i<d.length;i++)d[i]=.5+(inside(i)?1:-1)*d[i]/Math.min(dx,dy);
  return d;
 }
 function sampleDistance(d,u,v){
  const pixel=Math.min(d.designWidth/(d.cols-1),d.designHeight/(d.rows-1));
  if(u<=0||u>=1||v<=0||v>=1)return -Math.hypot(Math.max(0,-u,u-1)*d.designWidth,Math.max(0,-v,v-1)*d.designHeight)-pixel*.5;
  const x=u*(d.cols-1),y=v*(d.rows-1),a=Math.floor(x),b=Math.floor(y),tx=x-a,ty=y-b,h=d.contour;
  return ((h[b*d.cols+a]*(1-tx)+h[b*d.cols+a+1]*tx)*(1-ty)+(h[(b+1)*d.cols+a]*(1-tx)+h[(b+1)*d.cols+a+1]*tx)*ty-.5)*pixel;
 }
 function refine(source,o,spacing){
  const p=Array.from(source.positions),n=Array.from(source.normals),uv=Array.from(source.uv),distance=Array.from(source.distance),thickness=Array.from(source.thickness),outer=Array.from(source.outer);let tris=source.indices;
  const perimeter=source.chart.perimeter,regions=(o.designs||[o]).map(d=>{const rot=(d.designRotation||0)*Math.PI/180;return {...d,center:SleeveTemplate.arcAt(source.chart,(d.designAngle||0)*Math.PI/180+Math.PI/2),c:Math.cos(rot),s:Math.sin(rot)}});
  // p, n and uv only grow (existing vertices never change), so one view object and a per-vertex memo are exact.
  const view={positions:p,normals:n,uv,chart:source.chart,height:source.height},nearMemo=[];
  const near=i=>{const m=nearMemo[i];if(m!==undefined)return m;return nearMemo[i]=nearTest(i)};
  const nearTest=i=>!!outer[i]&&regions.some(d=>{const xy=SleeveTemplate.artworkPoint(view,i,d);if(!xy)return false;const [dx,dy]=xy;return Math.abs(dx*d.c+dy*d.s)<d.designWidth/2+2&&Math.abs(-dx*d.s+dy*d.c)<d.designHeight/2+2});
  const edgeDistance=[];
  const distanceToContour=i=>{if(edgeDistance[i]!==undefined)return edgeDistance[i];let nearest=Infinity;for(const d of regions){if(!d.contour)return 0;const xy=SleeveTemplate.artworkPoint(view,i,d);if(!xy)continue;const [dx,dy]=xy;nearest=Math.min(nearest,Math.abs(sampleDistance(d,(dx*d.c+dy*d.s)/d.designWidth+.5,.5-(-dx*d.s+dy*d.c)/d.designHeight)))}return edgeDistance[i]=nearest;};
  const splits=pairTable(tris.length/6),edge=(a,b)=>a<b?splits.get(a,b):splits.get(b,a);
  for(let pass=0;pass<12;pass++){
   if(pass)splits.clear();const touched=new Uint8Array(p.length/3);
   for(let f=0;f<tris.length;f+=3){const t0=tris[f],t1=tris[f+1],t2=tris[f+2];if(!(near(t0)||near(t1)||near(t2)))continue;let best=spacing,a,b;for(let e=0;e<3;e++){const x=e===0?t0:e===1?t1:t2,y=e===0?t1:e===1?t2:t0,len=Math.hypot(p[x*3]-p[y*3],p[x*3+1]-p[y*3+1],p[x*3+2]-p[y*3+2]);if(len>best){best=len;a=x;b=y}}if(a===undefined||edge(a,b)>=0)continue;
    // Keep the finest triangles only in a conservative band around contours.
    // Interiors retain a 0.5 mm surface mesh; the original sleeve is untouched.
    if(best<=.5){const d0=distanceToContour(t0),d1=distanceToContour(t1),d2=distanceToContour(t2);if(Math.min(d0,d1,d2)>best*1.5+spacing)continue}
    const i=p.length/3;if(a<b)splits.set(a,b,i);else splits.set(b,a,i);touched[a]=touched[b]=1;for(let k=0;k<3;k++){p.push((p[a*3+k]+p[b*3+k])/2);n.push((n[a*3+k]+n[b*3+k])/2)}const length=Math.hypot(n[i*3],n[i*3+1],n[i*3+2])||1;for(let k=0;k<3;k++)n[i*3+k]/=length;let du=uv[b]-uv[a];du-=Math.round(du/perimeter)*perimeter;uv.push((uv[a]+du/2+perimeter)%perimeter);distance.push(Math.min(distance[a],distance[b]));thickness.push(Math.min(thickness[a],thickness[b]));outer.push(outer[a]&&outer[b]?1:0);
   }
   if(!splits.size)break;if(p.length/3>(o.meshBudget||1400000)){const error=Error('Artwork needs more mesh detail than this browser can hold.');error.code='MESH_BUDGET';throw error;}// Faces go into a growable typed buffer (same order as before) instead of millions of Array pushes.
   let next=new Uint32Array(tris.length+splits.size*12+64),len=0;const T=(x,y,z)=>{if(len+3>next.length){const g=new Uint32Array(next.length*2);g.set(next);next=g}next[len]=x;next[len+1]=y;next[len+2]=z;len+=3};
   for(let f=0;f<tris.length;f+=3){const a=tris[f],b=tris[f+1],c=tris[f+2];
    // A split edge has both ends touched; faces with fewer touched corners skip the table lookups.
    if((touched[a]===1?1:0)+(touched[b]===1?1:0)+(touched[c]===1?1:0)<2){T(a,b,c);continue}
    const ab=edge(a,b),bc=edge(b,c),ca=edge(c,a),bits=(ab>=0?1:0)+(bc>=0?2:0)+(ca>=0?4:0);switch(bits){case 0:T(a,b,c);break;case 1:T(a,ab,c);T(ab,b,c);break;case 2:T(b,bc,a);T(bc,c,a);break;case 4:T(c,ca,b);T(ca,a,b);break;case 3:T(b,bc,ab);T(a,ab,c);T(ab,bc,c);break;case 5:T(a,ab,ca);T(ab,b,c);T(ab,c,ca);break;case 6:T(c,ca,bc);T(a,b,ca);T(b,bc,ca);break;case 7:T(a,ab,ca);T(ab,b,bc);T(ca,bc,c);T(ab,bc,ca);break}}
   tris=next.subarray(0,len);
  }
  return{...source,positions:p,normals:n,uv,distance,thickness,outer,indices:tris,spacing};
 }
 function build(source,o){
  if(!(o.designs?.some(d=>d.heightmap)||o.heightmap)||!o.maxHeight)return SleeveTemplate.build(source,o);
  const artwork=(o.designs||[o]).filter(d=>d.heightmap).map(d=>({...d,contour:contourField(d.sharp===false?{...d,smoothContours:false,heightmap:Float32Array.from(d.heightmap,v=>Math.min(1,v*500))}:d)}));
  const p=refine(source,{...o,designs:artwork},o.sharpSpacing||.22),count=p.positions.length/3,field=new Float32Array(count),offsets=new Float32Array(count),values=Array.from(p.positions),amplitude=new Array(count).fill(0),indices=[],highIds=new Map(),cuts=new Map(),walls=[];
  const depth=Math.min(3,o.maxHeight),sign=o.negative?-1:1;let affected=0,clipped=0,safe=3;
  const designs=artwork.map(d=>{const rot=(d.designRotation||0)*Math.PI/180;return {...d,cs:SleeveTemplate.arcAt(p.chart,(d.designAngle||0)*Math.PI/180+Math.PI/2),c:Math.cos(rot),s:Math.sin(rot)}});
  const sample=(d,u,v)=>.5+sampleDistance(d,u,v);
  const strength=(d,u,v)=>{if(d.sharp!==false)return 1;if(u<0||u>1||v<0||v>1)return 0;const x=u*(d.cols-1),y=v*(d.rows-1),a=Math.floor(x),b=Math.floor(y),c=Math.min(a+1,d.cols-1),e=Math.min(b+1,d.rows-1),tx=x-a,ty=y-b;return (d.heightmap[b*d.cols+a]*(1-tx)+d.heightmap[b*d.cols+c]*tx)*(1-ty)+(d.heightmap[e*d.cols+a]*(1-tx)+d.heightmap[e*d.cols+c]*tx)*ty;};
  const affectedByDesign=designs.map(()=>0);
  for(let i=0;i<count;i++){if(!p.outer[i])continue;let value=-1000;
   for(let j=0;j<designs.length;j++){const d=designs[j];const xy=SleeveTemplate.artworkPoint(p,i,d);if(!xy)continue;const [dx,dy]=xy;const v=sample(d,(dx*d.c+dy*d.s)/d.designWidth+.5,.5-(-dx*d.s+dy*d.c)/d.designHeight);value=Math.max(value,v);if(v>.5&&p.distance[i]>=1.199&&Number.isFinite(p.thickness[i])&&p.thickness[i]>=1.6)affectedByDesign[j]++;if(v>.5){const localDepth=Math.max(0,Math.min(3,d.maxHeight??depth))*strength(d,(dx*d.c+dy*d.s)/d.designWidth+.5,.5-(-dx*d.s+dy*d.c)/d.designHeight);offsets[i]=(d.negative??o.negative)?-localDepth:localDepth;if(offsets[i]<0&&localDepth>p.thickness[i]-.8+.001&&p.distance[i]>=1.199&&p.thickness[i]>=1.6)throw Error('Deboss depth exceeds the wall allowance for one design. Reduce its depth.');}}
   // Points on walls thinner than 1.6 mm (often hidden inner layers of a custom template under the visible surface)
   // are clipped here, so the deboss allowance check above skips them instead of failing the whole build.
   if(value>0&&(p.distance[i]<1.199||!Number.isFinite(p.thickness[i])||p.thickness[i]<1.6)){value=0;clipped++}field[i]=Math.abs(value-.5)<1e-7?(value>.5?.500001:.499999):value;// nudge off .5 on its own side: offsets exist only above .5
  if(field[i]>.5){affected++;safe=Math.min(safe,p.thickness[i]-.8)}
  }
  if(!o.designs&&o.negative&&depth>safe+.001)throw Error('Deboss is too deep here. Use '+Math.max(0,safe).toFixed(2)+' mm or less.');
  const high=i=>{if(highIds.has(i))return highIds.get(i);const id=values.length/3;for(let k=0;k<3;k++)values.push(p.positions[i*3+k]+p.normals[i*3+k]*offsets[i]);amplitude.push(1);highIds.set(i,id);return id};
  const cut=(a,b)=>{const edge=key(a,b);if(cuts.has(edge))return cuts.get(edge);const t=Math.max(.02,Math.min(.98,(.5-field[a])/(field[b]-field[a]))),base=[0,1,2].map(k=>p.positions[a*3+k]+t*(p.positions[b*3+k]-p.positions[a*3+k])),normal=[0,1,2].map(k=>p.normals[a*3+k]+t*(p.normals[b*3+k]-p.normals[a*3+k])),len=Math.hypot(...normal)||1,lo=values.length/3;values.push(...base);amplitude.push(0);const hi=values.length/3;values.push(...base.map((v,k)=>v+normal[k]/len*(field[a]>.5?offsets[a]:offsets[b])));amplitude.push(1);const result={lo,hi,cut:true};cuts.set(edge,result);return result};
  for(let f=0;f<p.indices.length;f+=3){const i0=p.indices[f],i1=p.indices[f+1],i2=p.indices[f+2],a0=field[i0]>.5,a1=field[i1]>.5,a2=field[i2]>.5;if(a0&&a1&&a2){const h0=high(i0),h1=high(i1);indices.push(h0,h1,high(i2));continue}if(!a0&&!a1&&!a2){indices.push(i0,i1,i2);continue}const ids=[i0,i1,i2],above=[a0,a1,a2];const hi=[],lo=[];
   for(let e=0;e<3;e++){const a=ids[e],b=ids[(e+1)%3];(above[e]?hi:lo).push({lo:a,hi:above[e]?high(a):a,cut:false});if(above[e]!==above[(e+1)%3]){const v=cut(a,b);hi.push(v);lo.push(v)}}
   for(const [polygon,side]of[[hi,'hi'],[lo,'lo']])for(let j=1;j<polygon.length-1;j++)indices.push(polygon[0][side],polygon[j][side],polygon[j+1][side]);
   for(let e=0;e<hi.length;e++){const a=hi[e],b=hi[(e+1)%hi.length];if(a.cut&&b.cut){walls.push(indices.length/3,indices.length/3+1);indices.push(b.hi,a.hi,a.lo,b.hi,a.lo,b.lo)}}
  }
  // Collapse only sliver edges whose link has exactly two common neighbors.
  // This removes sub-resolution triangles without opening the surface.
  let clean=indices,wallFaces=new Set(walls);const micro=o.weldSafe?1e-4:0;
  const packed=new Float32Array(values);
  for(let pass=0;pass<24;pass++){
   const pairs=[];
   for(let f=0;f<clean.length;f+=3){
    const ia=clean[f],ib=clean[f+1],ic=clean[f+2],a=ia*3,b=ib*3,c=ic*3;
    const ux=packed[b]-packed[a],uy=packed[b+1]-packed[a+1],uz=packed[b+2]-packed[a+2],vx=packed[c]-packed[a],vy=packed[c+1]-packed[a+1],vz=packed[c+2]-packed[a+2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,sliver=nx*nx+ny*ny+nz*nz<1e-12;
    // With o.weldSafe (custom templates) also collapse edges under 0.1 µm: STL importers weld nearby vertices, which
    // would fold such faces. Off for ETSYFOLGER, whose established exports have no such edges and stay unchanged.
    const shortest=Math.min(ux*ux+uy*uy+uz*uz,vx*vx+vy*vy+vz*vz,(packed[c]-packed[b])**2+(packed[c+1]-packed[b+1])**2+(packed[c+2]-packed[b+2])**2);if(!sliver&&!(shortest<micro*micro))continue;const limit=sliver?.05:micro;
    const candidates=[];for(let j=0;j<3;j++){const x=clean[f+j],y=clean[f+(j+1)%3];if(amplitude[x]!==amplitude[y])continue;const length=Math.hypot(packed[x*3]-packed[y*3],packed[x*3+1]-packed[y*3+1],packed[x*3+2]-packed[y*3+2]);if(length<limit)candidates.push([Math.min(x,y),Math.max(x,y),length])}candidates.sort((a,b)=>a[2]-b[2]);for(const [a,b]of candidates)pairs.push([a,b]);
   }
   if(!pairs.length)break;const wanted=new Set(pairs.flat()),neighbors=new Map([...wanted].map(i=>[i,new Set()]));
   const isWanted=new Uint8Array(packed.length/3);for(const i of wanted)isWanted[i]=1;
   for(let f=0;f<clean.length;f+=3)for(let j=0;j<3;j++){const a=clean[f+j];if(isWanted[a]===1){neighbors.get(a).add(clean[f+(j+1)%3]);neighbors.get(a).add(clean[f+(j+2)%3])}}
   const merges=new Map(),touched=new Set();for(const[a,b]of pairs){if(touched.has(a)||touched.has(b))continue;const common=[...neighbors.get(a)].filter(i=>neighbors.get(b).has(i));if(common.length!==2)continue;merges.set(b,a);touched.add(a);touched.add(b);for(const v of neighbors.get(a))touched.add(v);for(const v of neighbors.get(b))touched.add(v)}if(!merges.size)break;
   const mergeTo=new Int32Array(packed.length/3).fill(-1);for(const [b,a]of merges)mergeTo[b]=a;const to=i=>mergeTo[i]>=0?mergeTo[i]:i;
   const isWall=new Uint8Array(clean.length/3);for(const w of wallFaces)isWall[w]=1;
   const next=new Uint32Array(clean.length),nextWalls=new Set();let kept=0;for(let f=0;f<clean.length;f+=3){const x=to(clean[f]),y=to(clean[f+1]),z=to(clean[f+2]);if(x===y||y===z||x===z)continue;if(isWall[f/3]===1)nextWalls.add(kept/3);next[kept]=x;next[kept+1]=y;next[kept+2]=z;kept+=3}clean=next.subarray(0,kept);wallFaces=nextWalls;
  }
  clean=flipCollinear(packed,clean,wallFaces);
  return{positions:packed,indices:new Uint32Array(clean),amplitude:new Float32Array(amplitude),walls:new Uint32Array([...wallFaces]),info:{affected,affectedByDesign,clipped,maxSafeDepth:safe,peakDepth:depth,spacing:p.spacing,perimeter:p.chart.perimeter,sharp:true}};
 }
 // A face can still be collinear (a vertex lying on its opposite edge, all edges too long to collapse), which
 // happens on flat, axis-aligned facets of CAD meshes. Flip that longest edge with the neighbouring face: the
 // two faces cover exactly the same area afterwards, so the surface is unchanged but no face has zero area.
 // Uses the export check's threshold, so meshes that already pass are returned untouched.
 function flipCollinear(P,tris,wallFaces){
  const area2=(i,j,k)=>{const ux=P[j*3]-P[i*3],uy=P[j*3+1]-P[i*3+1],uz=P[j*3+2]-P[i*3+2],vx=P[k*3]-P[i*3],vy=P[k*3+1]-P[i*3+1],vz=P[k*3+2]-P[i*3+2];return (uy*vz-uz*vy)**2+(uz*vx-ux*vz)**2+(ux*vy-uy*vx)**2};
  const len2=(i,j)=>(P[i*3]-P[j*3])**2+(P[i*3+1]-P[j*3+1])**2+(P[i*3+2]-P[j*3+2])**2;
  for(let pass=0;pass<8;pass++){
   const bad=[];for(let f=0;f<tris.length;f+=3)if(!wallFaces.has(f/3)&&area2(tris[f],tris[f+1],tris[f+2])<1e-18)bad.push(f);if(!bad.length)break;
   // For each bad face: its longest directed edge x->y and the opposite vertex c.
   const want=new Map();for(const f of bad){let e=0,best=-1;for(let j=0;j<3;j++){const l=len2(tris[f+j],tris[f+(j+1)%3]);if(l>best){best=l;e=j}}want.set(tris[f+(e+1)%3]+','+tris[f+e],{f,x:tris[f+e],y:tris[f+(e+1)%3],c:tris[f+(e+2)%3]})}
   const found=[],hub=new Map();for(const w of want.values()){hub.set(w.c,new Set())}
   for(let g=0;g<tris.length;g+=3)for(let j=0;j<3;j++){const a=tris[g+j],b=tris[g+(j+1)%3],w=want.get(a+','+b);if(w&&w.f!==g&&!wallFaces.has(g/3))found.push({...w,g,d:tris[g+(j+2)%3]});if(hub.has(a)){hub.get(a).add(b);hub.get(a).add(tris[g+(j+2)%3])}}
   const used=new Set();let flipped=0;
   for(const {f,g,x,y,c,d}of found){if(used.has(f)||used.has(g)||hub.get(c).has(d)||area2(c,x,d)<1e-18||area2(d,y,c)<1e-18)continue;used.add(f);used.add(g);hub.get(c).add(d);
    tris[f]=c;tris[f+1]=x;tris[f+2]=d;tris[g]=d;tris[g+1]=y;tris[g+2]=c;flipped++}
   if(!flipped)break;
  }
  return tris;
 }
 function buildAdaptive(source,o){
  const requested=o.sharpSpacing||.22;let spacing=requested;
  for(;;){try{const result=build(source,{...o,sharpSpacing:spacing});result.info.requestedSpacing=requested;result.info.adapted=spacing>requested;return result;}catch(error){if(error.code!=='MESH_BUDGET'||spacing>=.5)throw error;spacing=Math.min(.5,spacing*1.3);}}
 }
 return{build,buildAdaptive,refine,contourField,pixelField,vectorField,traceLoops,sampleDistance,flipCollinear};
})();

