'use strict';
// Finds where a bottom logo fits on a template: the flat underside (faces pointing down) or the inside floor
// (faces pointing up), both within the bottom 12 mm, the same faces the relief builder accepts for a bottom logo.
// Pure geometry, no DOM, so the page and the node tests share it.
globalThis.BottomFit=(()=>{
  const CELL=.25,MAX_CELLS=640;
  // 1D squared Euclidean distance transform (Felzenszwalb & Huttenlocher).
  function edt1(f,n,stride,offset,tmp,v,z){
    for(let i=0;i<n;i++)tmp[i]=f[offset+i*stride];
    const cut=(q,p)=>((tmp[q]+q*q)-(tmp[p]+p*p))/(2*q-2*p);
    let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;
    for(let q=1;q<n;q++){let s=cut(q,v[k]);while(s<=z[k]){k--;s=cut(q,v[k])}k++;v[k]=q;z[k]=s;z[k+1]=Infinity}
    k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;f[offset+q*stride]=(q-v[k])*(q-v[k])+tmp[v[k]]}
  }
  // Distance (mm) from every inside cell to the nearest outside cell.
  function distanceField(mask,w,h,cell){
    const BIG=1e12,f=new Float64Array(w*h);for(let i=0;i<f.length;i++)f[i]=mask[i]?BIG:0;
    const n=Math.max(w,h),tmp=new Float64Array(n),v=new Int32Array(n),z=new Float64Array(n+1);
    for(let x=0;x<w;x++)edt1(f,h,w,x,tmp,v,z);for(let y=0;y<h;y++)edt1(f,w,1,y*w,tmp,v,z);
    const d=new Float32Array(w*h);for(let i=0;i<d.length;i++)d[i]=Math.sqrt(f[i])*cell;return d;
  }
  // Rasterises the qualifying faces into an x/z grid (cell centres inside a face count).
  function region(positions,indices,surface='underside'){
    const P=positions,I=indices,sign=surface==='inside'?1:-1,faces=[];let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity,ySum=0,aSum=0;
    for(let f=0;f<I.length;f+=3){const a=I[f]*3,b=I[f+1]*3,c=I[f+2]*3;
      const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.hypot(nx,ny,nz);if(len<1e-12)continue;
      if(sign*ny/len<.95||Math.max(P[a+1],P[b+1],P[c+1])>12)continue;
      faces.push(a,b,c);x0=Math.min(x0,P[a],P[b],P[c]);x1=Math.max(x1,P[a],P[b],P[c]);z0=Math.min(z0,P[a+2],P[b+2],P[c+2]);z1=Math.max(z1,P[a+2],P[b+2],P[c+2]);
      const area=len/2;ySum+=area*(P[a+1]+P[b+1]+P[c+1])/3;aSum+=area}
    if(!faces.length)return null;
    const cell=Math.max(CELL,(x1-x0)/MAX_CELLS,(z1-z0)/MAX_CELLS),w=Math.ceil((x1-x0)/cell)+3,h=Math.ceil((z1-z0)/cell)+3,ox=x0-cell,oz=z0-cell,mask=new Uint8Array(w*h);
    for(let k=0;k<faces.length;k+=3){const a=faces[k],b=faces[k+1],c=faces[k+2],ax=P[a],az=P[a+2],bx=P[b],bz=P[b+2],cx=P[c],cz=P[c+2];
      const d=(bx-ax)*(cz-az)-(cx-ax)*(bz-az);if(Math.abs(d)<1e-12)continue;
      const i0=Math.max(0,Math.floor((Math.min(ax,bx,cx)-ox)/cell)),i1=Math.min(w-1,Math.ceil((Math.max(ax,bx,cx)-ox)/cell)),j0=Math.max(0,Math.floor((Math.min(az,bz,cz)-oz)/cell)),j1=Math.min(h-1,Math.ceil((Math.max(az,bz,cz)-oz)/cell));
      for(let j=j0;j<=j1;j++){const z=oz+(j+.5)*cell;for(let i=i0;i<=i1;i++){const x=ox+(i+.5)*cell,l1=((x-ax)*(cz-az)-(cx-ax)*(z-az))/d,l2=((bx-ax)*(z-az)-(x-ax)*(bz-az))/d;if(l1>=-1e-9&&l2>=-1e-9&&l1+l2<=1+1e-9)mask[j*w+i]=1}}}
    return{surface,cell,w,h,ox,oz,mask,y:ySum/aSum,distance:distanceField(mask,w,h,cell)};
  }
  // The point deepest inside the region (largest clear circle); ties go to the one nearest the region's centre.
  function best(r){
    if(!r)return null;let top=0;for(const d of r.distance)top=Math.max(top,d);if(top<=0)return null;
    let sx=0,sz=0,n=0;for(let j=0;j<r.h;j++)for(let i=0;i<r.w;i++)if(r.mask[j*r.w+i]){sx+=i;sz+=j;n++}
    const ci=sx/n,cj=sz/n;let pick=-1,pd=Infinity;
    for(let j=0;j<r.h;j++)for(let i=0;i<r.w;i++){const k=j*r.w+i;if(r.distance[k]>=top-r.cell*.5){const dd=(i-ci)**2+(j-cj)**2;if(dd<pd){pd=dd;pick=k}}}
    const i=pick%r.w,j=(pick-i)/r.w;return{x:r.ox+(i+.5)*r.cell,z:r.oz+(j+.5)*r.cell,radius:r.distance[pick]};
  }
  // Distance from region edges at a world point (0 outside the region).
  function clearanceAt(r,x,z){const i=Math.floor((x-r.ox)/r.cell),j=Math.floor((z-r.oz)/r.cell);return i<0||j<0||i>=r.w||j>=r.h?0:r.distance[j*r.w+i]}
  // World position of a logo pixel, matching SleeveTemplate.artworkPoint (the inside floor is mirrored so it reads from above).
  function logoPoint(place,u,v){return[place.centerX+(place.surface==='inside'?-1:1)*(u-.5)*place.width,place.centerZ+(.5-v)*place.height]}
  // Smallest edge clearance over the logo's ink at a placement.
  function logoClearance(r,mask,place,step=2){let min=Infinity;for(let y=0;y<mask.rows;y+=step)for(let x=0;x<mask.cols;x+=step){if(mask.hm[y*mask.cols+x]<=.25)continue;const [px,pz]=logoPoint(place,x/(mask.cols-1),y/(mask.rows-1));min=Math.min(min,clearanceAt(r,px,pz))}return min}
  // Furthest ink from the logo centre, as a fraction of logo width (a circle of radius width*k holds the logo).
  function inkRadius(mask,aspect){let m=0;for(let y=0;y<mask.rows;y++)for(let x=0;x<mask.cols;x++)if(mask.hm[y*mask.cols+x]>.25)m=Math.max(m,Math.hypot(x/(mask.cols-1)-.5,(y/(mask.rows-1)-.5)*aspect));return m}
  return{region,best,clearanceAt,logoClearance,logoPoint,inkRadius,distanceField};
})();
