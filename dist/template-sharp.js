'use strict';
globalThis.SharpSleeve=(()=>{
 const key=(a,b)=>a<b?a+','+b:b+','+a;
 // Interpolate distance to the silhouette, not saturated alpha. Binary alpha
 // gives every crossed mesh edge a midpoint, creating mesh-sized sawteeth.
 function contourField(o){
  const {cols,rows,heightmap}=o,dx=o.designWidth/(cols-1),dy=o.designHeight/(rows-1),diag=Math.hypot(dx,dy),d=new Float32Array(cols*rows);d.fill(1e6);
  const inside=i=>heightmap[i]>.5;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
   const i=y*cols+x,a=heightmap[i];
   if(inside(i))d[i]=Math.min(d[i],(x+.5)*dx,(cols-x-.5)*dx,(y+.5)*dy,(rows-y-.5)*dy);
   for(const [j,step]of[[x+1<cols?i+1:-1,dx],[y+1<rows?i+cols:-1,dy]])if(j>=0&&inside(i)!==inside(j)){
    const t=Math.abs((.5-a)/(heightmap[j]-a));d[i]=Math.min(d[i],t*step);d[j]=Math.min(d[j],(1-t)*step);
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
  const p=Array.from(source.positions),n=Array.from(source.normals),uv=Array.from(source.uv),distance=Array.from(source.distance),thickness=Array.from(source.thickness),outer=Array.from(source.outer);let tris=Array.from(source.indices);
  const perimeter=source.chart.perimeter,regions=(o.designs||[o]).map(d=>{const rot=(d.designRotation||0)*Math.PI/180;return {...d,center:SleeveTemplate.arcAt(source.chart,(d.designAngle||0)*Math.PI/180+Math.PI/2),c:Math.cos(rot),s:Math.sin(rot)}});
  const near=i=>outer[i]&&regions.some(d=>{const xy=SleeveTemplate.artworkPoint({positions:p,normals:n,uv,chart:source.chart,height:source.height},i,d);if(!xy)return false;const [dx,dy]=xy;return Math.abs(dx*d.c+dy*d.s)<d.designWidth/2+2&&Math.abs(-dx*d.s+dy*d.c)<d.designHeight/2+2});
  const edgeDistance=[];
  const distanceToContour=i=>{if(edgeDistance[i]!==undefined)return edgeDistance[i];let nearest=Infinity;for(const d of regions){if(!d.contour)return 0;const xy=SleeveTemplate.artworkPoint({positions:p,normals:n,uv,chart:source.chart,height:source.height},i,d);if(!xy)continue;const [dx,dy]=xy;nearest=Math.min(nearest,Math.abs(sampleDistance(d,(dx*d.c+dy*d.s)/d.designWidth+.5,.5-(-dx*d.s+dy*d.c)/d.designHeight)))}return edgeDistance[i]=nearest;};
  for(let pass=0;pass<12;pass++){
   const splits=new Map();
   for(let f=0;f<tris.length;f+=3){const ids=tris.slice(f,f+3);if(!ids.some(near))continue;let best=spacing,a,b;for(let e=0;e<3;e++){const x=ids[e],y=ids[(e+1)%3],len=Math.hypot(p[x*3]-p[y*3],p[x*3+1]-p[y*3+1],p[x*3+2]-p[y*3+2]);if(len>best){best=len;a=x;b=y}}if(a===undefined||splits.has(key(a,b)))continue;
    // Keep the finest triangles only in a conservative band around contours.
    // Interiors retain a 0.5 mm surface mesh; the original sleeve is untouched.
    if(best<=.5&&Math.min(...ids.map(distanceToContour))>best*1.5+spacing)continue;
    const i=p.length/3;splits.set(key(a,b),i);for(let k=0;k<3;k++){p.push((p[a*3+k]+p[b*3+k])/2);n.push((n[a*3+k]+n[b*3+k])/2)}const length=Math.hypot(n[i*3],n[i*3+1],n[i*3+2])||1;for(let k=0;k<3;k++)n[i*3+k]/=length;let du=uv[b]-uv[a];du-=Math.round(du/perimeter)*perimeter;uv.push((uv[a]+du/2+perimeter)%perimeter);distance.push(Math.min(distance[a],distance[b]));thickness.push(Math.min(thickness[a],thickness[b]));outer.push(outer[a]&&outer[b]?1:0);
   }
   if(!splits.size)break;if(p.length/3>1400000){const error=Error('Artwork needs more mesh detail than this browser can hold.');error.code='MESH_BUDGET';throw error;}const next=[];
   for(let f=0;f<tris.length;f+=3){const[a,b,c]=tris.slice(f,f+3),ab=splits.get(key(a,b)),bc=splits.get(key(b,c)),ca=splits.get(key(c,a)),bits=(ab!==undefined?1:0)+(bc!==undefined?2:0)+(ca!==undefined?4:0);switch(bits){case 0:next.push(a,b,c);break;case 1:next.push(a,ab,c,ab,b,c);break;case 2:next.push(b,bc,a,bc,c,a);break;case 4:next.push(c,ca,b,ca,a,b);break;case 3:next.push(b,bc,ab,a,ab,c,ab,bc,c);break;case 5:next.push(a,ab,ca,ab,b,c,ab,c,ca);break;case 6:next.push(c,ca,bc,a,b,ca,b,bc,ca);break;case 7:next.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);break}}
   tris=next;
  }
  return{...source,positions:p,normals:n,uv,distance,thickness,outer,indices:tris,spacing};
 }
 function build(source,o){
  if(!(o.designs?.some(d=>d.heightmap)||o.heightmap)||!o.maxHeight)return SleeveTemplate.build(source,o);
  const artwork=(o.designs||[o]).filter(d=>d.heightmap).map(d=>({...d,contour:contourField(d)}));
  const p=refine(source,{...o,designs:artwork},o.sharpSpacing||.22),count=p.positions.length/3,field=new Float32Array(count),values=Array.from(p.positions),amplitude=new Array(count).fill(0),indices=[],highIds=new Map(),cuts=new Map(),walls=[];
  const depth=Math.min(3,o.maxHeight),sign=o.negative?-1:1;let affected=0,clipped=0,safe=3;
  const designs=artwork.map(d=>{const rot=(d.designRotation||0)*Math.PI/180;return {...d,cs:SleeveTemplate.arcAt(p.chart,(d.designAngle||0)*Math.PI/180+Math.PI/2),c:Math.cos(rot),s:Math.sin(rot)}});
  const sample=(d,u,v)=>.5+sampleDistance(d,u,v);
  const affectedByDesign=designs.map(()=>0);
  for(let i=0;i<count;i++){if(!p.outer[i])continue;let value=-1000;
   for(let j=0;j<designs.length;j++){const d=designs[j];const xy=SleeveTemplate.artworkPoint(p,i,d);if(!xy)continue;const [dx,dy]=xy;const v=sample(d,(dx*d.c+dy*d.s)/d.designWidth+.5,.5-(-dx*d.s+dy*d.c)/d.designHeight);value=Math.max(value,v);if(v>.5&&p.distance[i]>=1.199&&Number.isFinite(p.thickness[i])&&p.thickness[i]>=1.6)affectedByDesign[j]++}
   if(value>0&&(p.distance[i]<1.199||!Number.isFinite(p.thickness[i])||p.thickness[i]<1.6)){value=0;clipped++}field[i]=Math.abs(value-.5)<1e-7?.500001:value;if(field[i]>.5){affected++;safe=Math.min(safe,p.thickness[i]-.8)}
  }
  if(o.negative&&depth>safe+.001)throw Error('Deboss is too deep here. Use '+Math.max(0,safe).toFixed(2)+' mm or less.');
  const high=i=>{if(highIds.has(i))return highIds.get(i);const id=values.length/3;for(let k=0;k<3;k++)values.push(p.positions[i*3+k]+p.normals[i*3+k]*depth*sign);amplitude.push(1);highIds.set(i,id);return id};
  const cut=(a,b)=>{const edge=key(a,b);if(cuts.has(edge))return cuts.get(edge);const t=Math.max(.02,Math.min(.98,(.5-field[a])/(field[b]-field[a]))),base=[0,1,2].map(k=>p.positions[a*3+k]+t*(p.positions[b*3+k]-p.positions[a*3+k])),normal=[0,1,2].map(k=>p.normals[a*3+k]+t*(p.normals[b*3+k]-p.normals[a*3+k])),len=Math.hypot(...normal)||1,lo=values.length/3;values.push(...base);amplitude.push(0);const hi=values.length/3;values.push(...base.map((v,k)=>v+normal[k]/len*depth*sign));amplitude.push(1);const result={lo,hi,cut:true};cuts.set(edge,result);return result};
  for(let f=0;f<p.indices.length;f+=3){const ids=p.indices.slice(f,f+3),above=ids.map(i=>field[i]>.5);if(above.every(Boolean)){indices.push(...ids.map(high));continue}if(above.every(v=>!v)){indices.push(...ids);continue}const hi=[],lo=[];
   for(let e=0;e<3;e++){const a=ids[e],b=ids[(e+1)%3];(above[e]?hi:lo).push({lo:a,hi:above[e]?high(a):a,cut:false});if(above[e]!==above[(e+1)%3]){const v=cut(a,b);hi.push(v);lo.push(v)}}
   for(const [polygon,side]of[[hi,'hi'],[lo,'lo']])for(let j=1;j<polygon.length-1;j++)indices.push(polygon[0][side],polygon[j][side],polygon[j+1][side]);
   for(let e=0;e<hi.length;e++){const a=hi[e],b=hi[(e+1)%hi.length];if(a.cut&&b.cut){walls.push(indices.length/3,indices.length/3+1);indices.push(b.hi,a.hi,a.lo,b.hi,a.lo,b.lo)}}
  }
  // Collapse only sliver edges whose link has exactly two common neighbors.
  // This removes sub-resolution triangles without opening the surface.
  let clean=indices,wallFaces=new Set(walls);
  const packed=new Float32Array(values);
  for(let pass=0;pass<24;pass++){
   const pairs=[];
   for(let f=0;f<clean.length;f+=3){
    const ia=clean[f],ib=clean[f+1],ic=clean[f+2],a=ia*3,b=ib*3,c=ic*3;
    const ux=packed[b]-packed[a],uy=packed[b+1]-packed[a+1],uz=packed[b+2]-packed[a+2],vx=packed[c]-packed[a],vy=packed[c+1]-packed[a+1],vz=packed[c+2]-packed[a+2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;if(nx*nx+ny*ny+nz*nz>=1e-12)continue;
    const candidates=[];for(let j=0;j<3;j++){const x=clean[f+j],y=clean[f+(j+1)%3];if(amplitude[x]!==amplitude[y])continue;const length=Math.hypot(packed[x*3]-packed[y*3],packed[x*3+1]-packed[y*3+1],packed[x*3+2]-packed[y*3+2]);if(length<.05)candidates.push([Math.min(x,y),Math.max(x,y),length])}candidates.sort((a,b)=>a[2]-b[2]);for(const [a,b]of candidates)pairs.push([a,b]);
   }
   if(!pairs.length)break;const wanted=new Set(pairs.flat()),neighbors=new Map([...wanted].map(i=>[i,new Set()]));
   for(let f=0;f<clean.length;f+=3)for(let j=0;j<3;j++){const a=clean[f+j];if(neighbors.has(a)){neighbors.get(a).add(clean[f+(j+1)%3]);neighbors.get(a).add(clean[f+(j+2)%3])}}
   const merges=new Map(),touched=new Set();for(const[a,b]of pairs){if(touched.has(a)||touched.has(b))continue;const common=[...neighbors.get(a)].filter(i=>neighbors.get(b).has(i));if(common.length!==2)continue;merges.set(b,a);touched.add(a);touched.add(b);for(const v of neighbors.get(a))touched.add(v);for(const v of neighbors.get(b))touched.add(v)}if(!merges.size)break;
   const next=[],nextWalls=new Set();for(let f=0;f<clean.length;f+=3){const ids=clean.slice(f,f+3).map(i=>merges.get(i)??i);if(new Set(ids).size<3)continue;if(wallFaces.has(f/3))nextWalls.add(next.length/3);next.push(...ids)}clean=next;wallFaces=nextWalls;
  }
  return{positions:packed,indices:new Uint32Array(clean),amplitude:new Float32Array(amplitude),walls:new Uint32Array([...wallFaces]),info:{affected,affectedByDesign,clipped,maxSafeDepth:safe,peakDepth:depth,spacing:p.spacing,perimeter:p.chart.perimeter,sharp:true}};
 }
 function buildAdaptive(source,o){
  const requested=o.sharpSpacing||.22;let spacing=requested;
  for(;;){try{const result=build(source,{...o,sharpSpacing:spacing});result.info.requestedSpacing=requested;result.info.adapted=spacing>requested;return result;}catch(error){if(error.code!=='MESH_BUDGET'||spacing>=.5)throw error;spacing=Math.min(.5,spacing*1.3);}}
 }
 return{build,buildAdaptive,refine,contourField};
})();

