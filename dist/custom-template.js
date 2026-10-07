'use strict';
/* Custom STL templates: parse any binary/ASCII STL, weld, orient and prepare the
   same per-template surface data as the precomputed ETSYFOLGER assets
   (positions, normals, indices, distance, thickness, uv, outer, chart, height). */
globalThis.CustomTemplate=(()=>{
  const WALL_CAP=4,MAX_BYTES=100*1024*1024,MAX_TRIANGLES=2000000,DISPLAY_TRIANGLES=300000,BOTTOM_BAND=12;
  const UP_AXES=['auto','+z','-z','+y','-y','+x','-x'],TURNS=[0,90,180,270],UNITS={mm:1,cm:10,in:25.4,m:1000};
  const fail=(message,code)=>{const e=Error(message);if(code)e.code=code;return e};

  // ---------- Parsing ----------
  function parseSTL(buffer){
    if(ArrayBuffer.isView(buffer))buffer=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);if(!buffer||typeof buffer.byteLength!=='number')throw fail('No STL data was provided.','EMPTY');
    if(!buffer.byteLength)throw fail('The STL file is empty.','EMPTY');
    if(buffer.byteLength>MAX_BYTES)throw fail('The STL is larger than 100 MB. Simplify it in your CAD or mesh tool first.','TOO_LARGE');
    const view=new DataView(buffer),bytes=new Uint8Array(buffer),head=new TextDecoder().decode(bytes.subarray(0,Math.min(bytes.length,1024)));
    // Binary exporters often write "solid" into the 80-byte header, so only treat the file as ASCII when it also has ASCII facets.
    const looksAscii=/^\s*solid\b/i.test(head)&&/\bfacet\b|\bendsolid\b/i.test(head);
    if(buffer.byteLength>=84){
      const count=view.getUint32(80,true),expected=84+count*50;
      // Some exporters pad binary files with a few trailing bytes; accept that, but never a short file.
      if(count&&(expected===buffer.byteLength||(!looksAscii&&expected<buffer.byteLength&&buffer.byteLength-expected<512))){
        if(count>MAX_TRIANGLES)throw fail('The STL has '+count.toLocaleString()+' triangles; the limit is '+MAX_TRIANGLES.toLocaleString()+'. Decimate it first.','TOO_LARGE');
        const soup=new Float32Array(count*9);
        for(let f=0,o=84;f<count;f++,o+=50)for(let k=0;k<9;k++){const v=view.getFloat32(o+12+k*4,true);if(!Number.isFinite(v))throw fail('The STL contains invalid (NaN or infinite) coordinates in triangle '+(f+1).toLocaleString()+'.','BAD_COORDS');soup[f*9+k]=v}
        return{soup,triangles:count,format:'binary'};
      }
      if(!count&&expected===buffer.byteLength)throw fail('The STL contains no triangles.','EMPTY');
    }
    if(!looksAscii){
      if(buffer.byteLength>=84){const count=view.getUint32(80,true);
        if(count&&count<=MAX_TRIANGLES&&84+count*50>buffer.byteLength)throw fail('This STL is truncated: it declares '+count.toLocaleString()+' triangles but only '+Math.max(0,Math.floor((buffer.byteLength-84)/50)).toLocaleString()+' are present. Export or download it again.','BAD_FORMAT');
        throw fail('This is not a valid STL: the binary triangle count does not match the file size, and it is not ASCII STL.','BAD_FORMAT')}
      throw fail('This is not a valid STL file.','BAD_FORMAT');
    }
    // ASCII: scan in chunks into a growing Float32Array (a plain number array would need ~4x the memory).
    const decoder=new TextDecoder(),re=/vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi,CHUNK=8*1024*1024;let soup=new Float32Array(9*4096),n=0,carry='';
    for(let offset=0;offset<bytes.length;offset+=CHUNK){
      const last=offset+CHUNK>=bytes.length,text=carry+decoder.decode(bytes.subarray(offset,offset+CHUNK),{stream:!last});
      // Keep the unfinished final line for the next chunk.
      const cut=last?text.length:text.lastIndexOf('\n')+1;const part=text.slice(0,cut);carry=text.slice(cut);re.lastIndex=0;let m;
      while((m=re.exec(part))){if(n+3>soup.length){if(soup.length>=MAX_TRIANGLES*9)throw fail('The STL has more than '+MAX_TRIANGLES.toLocaleString()+' triangles. Decimate it first.','TOO_LARGE');const g=new Float32Array(Math.min(MAX_TRIANGLES*9,soup.length*2));g.set(soup);soup=g}
        for(let k=1;k<=3;k++){const v=Number(m[k]);if(!Number.isFinite(v))throw fail('The ASCII STL contains an invalid coordinate: '+m[k].slice(0,30),'BAD_COORDS');soup[n++]=v}}
    }
    if(!n)throw fail('The ASCII STL contains no triangles.','EMPTY');
    if(n%9)throw fail('The ASCII STL is truncated: a facet does not have exactly three vertices.','BAD_FORMAT');
    return{soup:soup.slice(0,n),triangles:n/9,format:'ascii'};
  }

  // ---------- Welding and topology ----------
  function weld(soup,tolerance=1e-5){
    const n=soup.length/3,scale=1/tolerance;let size=1;while(size<n*2)size<<=1;const mask=size-1,table=new Int32Array(size).fill(-1);
    const q=new Float64Array(n*3),remap=new Uint32Array(n),out=[];let count=0;
    for(let i=0;i<n;i++){
      const x=Math.round(soup[i*3]*scale),y=Math.round(soup[i*3+1]*scale),z=Math.round(soup[i*3+2]*scale);
      let h=(Math.imul(x|0,73856093)^Math.imul(y|0,19349663)^Math.imul(z|0,83492791))&mask;
      for(;;){const v=table[h];if(v<0){table[h]=count;q[count*3]=x;q[count*3+1]=y;q[count*3+2]=z;out.push(soup[i*3],soup[i*3+1],soup[i*3+2]);remap[i]=count++;break}if(q[v*3]===x&&q[v*3+1]===y&&q[v*3+2]===z){remap[i]=v;break}h=(h+1)&mask}
    }
    const positions=new Float32Array(out),faces=[];let degenerate=0,duplicate=0;const seen=new Map();
    for(let f=0;f<n/3;f++){
      const a=remap[f*3],b=remap[f*3+1],c=remap[f*3+2];if(a===b||b===c||c===a){degenerate++;continue}
      const s=[a,b,c].sort((u,v)=>u-v),key=s[0]*count+s[1];let list=seen.get(key);if(list?.includes(s[2])){duplicate++;continue}if(list)list.push(s[2]);else seen.set(key,[s[2]]);faces.push(a,b,c);
    }
    return{positions,indices:new Uint32Array(faces),welded:n-count,degenerate,duplicate};
  }
  // Half-edge groups via a vertex-bucketed table; avoids millions of string keys.
  function edgeTable(indices,vertexCount){
    const he=indices.length,counts=new Uint32Array(vertexCount+1);
    for(let i=0;i<he;i++){const a=indices[i],b=indices[i-i%3+(i%3+1)%3];counts[Math.min(a,b)+1]++}
    for(let v=0;v<vertexCount;v++)counts[v+1]+=counts[v];
    const cursor=counts.slice(0,vertexCount),hi=new Uint32Array(he),id=new Uint32Array(he);
    for(let i=0;i<he;i++){const a=indices[i],b=indices[i-i%3+(i%3+1)%3],lo=Math.min(a,b),p=cursor[lo]++;hi[p]=Math.max(a,b);id[p]=i}
    const partner=new Int32Array(he).fill(-1);let boundary=0,nonManifold=0,conflicts=0,edges=0;
    for(let v=0;v<vertexCount;v++){const s=counts[v],e=counts[v+1];for(let i=s;i<e;i++){if(hi[i]===0xffffffff)continue;let group=[id[i]];for(let j=i+1;j<e;j++)if(hi[j]===hi[i]){group.push(id[j]);hi[j]=0xffffffff}hi[i]=0xffffffff;edges++;
      if(group.length===1)boundary++;else if(group.length>2)nonManifold++;else{partner[group[0]]=group[1];partner[group[1]]=group[0];const d=h=>indices[h]<indices[h-h%3+(h%3+1)%3];if(d(group[0])===d(group[1]))conflicts++}}}
    return{partner,boundary,nonManifold,conflicts,edges};
  }
  function signedVolume(positions,indices,faceFilter){
    let v=0;for(let f=0;f<indices.length/3;f++){if(faceFilter&&!faceFilter(f))continue;const a=indices[f*3]*3,b=indices[f*3+1]*3,c=indices[f*3+2]*3;
      v+=positions[a]*(positions[b+1]*positions[c+2]-positions[b+2]*positions[c+1])-positions[a+1]*(positions[b]*positions[c+2]-positions[b+2]*positions[c])+positions[a+2]*(positions[b]*positions[c+1]-positions[b+1]*positions[c])}
    return v/6;
  }
  // Make winding consistent across manifold edges, then point every closed shell outward.
  function fixOrientation(positions,indices){
    const vc=positions.length/3,faces=indices.length/3,t=edgeTable(indices,vc),flip=new Uint8Array(faces),comp=new Int32Array(faces).fill(-1);let components=0,nonOrientable=0,flippedFaces=0;
    const dir=h=>indices[h]<indices[h-h%3+(h%3+1)%3];
    for(let s=0;s<faces;s++){if(comp[s]>=0)continue;const stack=[s];comp[s]=components;while(stack.length){const f=stack.pop();for(let e=0;e<3;e++){const h=f*3+e,p=t.partner[h];if(p<0)continue;const g=(p/3)|0,need=flip[f]^(dir(h)===dir(p)?1:0);if(comp[g]<0){comp[g]=components;flip[g]=need;stack.push(g)}else if(flip[g]!==need)nonOrientable++}}components++}
    const out=new Uint32Array(indices);for(let f=0;f<faces;f++)if(flip[f]){const b=out[f*3+1];out[f*3+1]=out[f*3+2];out[f*3+2]=b;flippedFaces++}
    const volumes=new Float64Array(components);
    for(let f=0;f<faces;f++){const a=out[f*3]*3,b=out[f*3+1]*3,c=out[f*3+2]*3;volumes[comp[f]]+=(positions[a]*(positions[b+1]*positions[c+2]-positions[b+2]*positions[c+1])-positions[a+1]*(positions[b]*positions[c+2]-positions[b+2]*positions[c])+positions[a+2]*(positions[b]*positions[c+1]-positions[b+1]*positions[c]))/6}
    // Nested shells (a separate inner cavity surface) legitimately have negative volume; only flip when the largest shell is inverted.
    let largest=0;for(let i=1;i<components;i++)if(Math.abs(volumes[i])>Math.abs(volumes[largest]))largest=i;
    let inverted=false;if(components&&volumes[largest]<0){inverted=true;for(let f=0;f<faces;f++){const b=out[f*3+1];out[f*3+1]=out[f*3+2];out[f*3+2]=b}}
    return{indices:out,components,nonOrientable:Math.ceil(nonOrientable/2),flippedFaces,inverted};
  }
  function analyze(positions,indices){
    const t=edgeTable(indices,positions.length/3);let zeroArea=0;
    for(let f=0;f<indices.length/3;f++){const a=indices[f*3]*3,b=indices[f*3+1]*3,c=indices[f*3+2]*3,ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;if(nx*nx+ny*ny+nz*nz<1e-18)zeroArea++}
    return{triangles:indices.length/3,vertices:positions.length/3,boundary:t.boundary,nonManifold:t.nonManifold,windingConflicts:t.conflicts,zeroArea,closed:!t.boundary&&!t.nonManifold&&!t.conflicts&&!zeroArea,volume:signedVolume(positions,indices)};
  }
  // Full clean-up from raw STL bytes: parse, weld, orient faces consistently, optionally run the existing conservative repair.
  function load(buffer,{repair=false}={}){
    const parsed=parseSTL(buffer),w=weld(parsed.soup);
    if(!w.indices.length)throw fail('Every triangle in this STL is degenerate (zero size). The file cannot be used as a template.','EMPTY');
    let positions=w.positions,indices=w.indices,repairReport=null;
    if(repair){if(!globalThis.MeshRepair)throw fail('Repair is unavailable.');const r=MeshRepair.repair(positions,indices);positions=r.positions;indices=r.indices;repairReport=r.report}
    const o=fixOrientation(positions,indices);indices=o.indices;
    const report={format:parsed.format,sourceTriangles:parsed.triangles,welded:w.welded,degenerate:w.degenerate,duplicate:w.duplicate,components:o.components,nonOrientable:o.nonOrientable,flippedFaces:o.flippedFaces,inverted:o.inverted,repaired:!!repair,repairReport,...analyze(positions,indices)};
    return{source:{positions,indices,closed:report.closed},report};
  }

  // ---------- Orientation ----------
  const upMaps={'+z':p=>[p[0],p[2],-p[1]],'-z':p=>[p[0],-p[2],p[1]],'+y':p=>[p[0],p[1],p[2]],'-y':p=>[p[0],-p[1],-p[2]],'+x':p=>[-p[1],p[0],p[2]],'-x':p=>[p[1],-p[0],p[2]]};
  function bounds(positions){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<positions.length;i+=3)for(let a=0;a<3;a++){const v=positions[i+a];if(v<lo[a])lo[a]=v;if(v>hi[a])hi[a]=v}return{min:lo,max:hi}}
  function normalizeOrientation(o={}){return{up:UP_AXES.includes(o.up)?o.up:'auto',turn:TURNS.includes(Number(o.turn))?Number(o.turn):0,units:Object.hasOwn(UNITS,o.units)?o.units:'mm',autoAlign:o.autoAlign!==false,raiseOnTexture:o.raiseOnTexture!==false}}
  // Principal horizontal direction of the outline: second moments of the cross-section perimeter at three heights,
  // integrated along each cut segment (length-weighted, so triangle density does not bias it). Heights are offset
  // slightly so a slice never passes exactly through a vertex. Returns 0 for near-round outlines, keeping the file's
  // own rotation instead of an arbitrary one.
  function outlineAngle(positions,indices,b){
    const h=b.max[1]-b.min[1];let L=0,sx=0,sz=0;const segs=[];
    for(const t of [.3013,.5007,.7019]){const y=b.min[1]+h*t;
      for(let f=0;f<indices.length;f+=3){const cut=[];for(let e=0;e<3;e++){const a=indices[f+e]*3,c=indices[f+(e+1)%3]*3,ya=positions[a+1],yc=positions[c+1];if((ya<y)!==(yc<y)){const k=(y-ya)/(yc-ya);cut.push(positions[a]+k*(positions[c]-positions[a]),positions[a+2]+k*(positions[c+2]-positions[a+2]))}}
        if(cut.length===4){const l=Math.hypot(cut[2]-cut[0],cut[3]-cut[1]);if(l>0){segs.push(cut,l);L+=l;sx+=l*(cut[0]+cut[2])/2;sz+=l*(cut[1]+cut[3])/2}}}}
    if(!(L>0))return 0;const mx=sx/L,mz=sz/L;let xx=0,xz=0,zz=0;
    for(let i=0;i<segs.length;i+=2){const [px,pz,qx,qz]=segs[i].map((v,k)=>v-(k%2?mz:mx)),l=segs[i+1];xx+=l*(px*px+px*qx+qx*qx)/3;zz+=l*(pz*pz+pz*qz+qz*qz)/3;xz+=l*(2*px*pz+px*qz+qx*pz+2*qx*qz)/6}
    const spread=Math.hypot(xx-zz,2*xz)/(xx+zz||1);return spread<.05?0:.5*Math.atan2(2*xz,xx-zz);
  }
  function orient(source,orientation={}){
    const o=normalizeOrientation(orientation),src=source.positions,b0=bounds(src),ext=b0.max.map((v,a)=>v-b0.min[a]);
    let up=o.up;if(up==='auto'){const axis=ext[2]>=ext[0]&&ext[2]>=ext[1]?2:ext[1]>=ext[0]?1:0;up='+'+'xyz'[axis]}
    const map=upMaps[up],scale=UNITS[o.units],n=src.length/3,out=new Float32Array(src.length);
    for(let i=0;i<n;i++){const p=map([src[i*3],src[i*3+1],src[i*3+2]]);out[i*3]=p[0]*scale;out[i*3+1]=p[1]*scale;out[i*3+2]=p[2]*scale}
    let b=bounds(out);const cx=(b.min[0]+b.max[0])/2,cz=(b.min[2]+b.max[2])/2;
    let angle=0;
    if(o.autoAlign)angle=outlineAngle(out,source.indices,b);
    // Rotate the widest horizontal axis to X (front faces +Z), then apply the user's quarter turn.
    const theta=-angle+o.turn*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
    for(let i=0;i<n;i++){const x=out[i*3]-cx,z=out[i*3+2]-cz;out[i*3]=c*x-s*z;out[i*3+2]=s*x+c*z}
    b=bounds(out);const ox=(b.min[0]+b.max[0])/2,oz=(b.min[2]+b.max[2])/2,oy=b.min[1];
    for(let i=0;i<n;i++){out[i*3]-=ox;out[i*3+1]-=oy;out[i*3+2]-=oz}
    b=bounds(out);const height=b.max[1]-b.min[1];
    if(!(height>0))throw fail('The model is flat along the chosen up axis. Choose another up axis.','FLAT');
    const base={positions:out,indices:source.indices,height,bounds:b,closed:!!source.closed,orientation:{...o,resolvedUp:up}};base.chart=profile(base);return base;
  }
  // Same cylindrical chart as SleeveTemplate.profile, on typed arrays.
  function profile(base){
    const P=base.positions,I=base.indices,y=base.height/2,seg=[];
    for(let f=0;f<I.length;f+=3){const hits=[];for(let e=0;e<3;e++){const a=I[f+e]*3,b=I[f+(e+1)%3]*3;if((P[a+1]<y)!==(P[b+1]<y)){const t=(y-P[a+1])/(P[b+1]-P[a+1]);hits.push(P[a]+t*(P[b]-P[a]),P[a+2]+t*(P[b+2]-P[a+2]))}}if(hits.length===4)seg.push(...hits)}
    const count=720,radii=new Float32Array(count);
    for(let i=0;i<count;i++){const t=i/count*Math.PI*2,dx=Math.cos(t),dz=Math.sin(t);for(let k=0;k<seg.length;k+=4){const ax=seg[k],az=seg[k+1],ex=seg[k+2]-ax,ez=seg[k+3]-az,det=dx*ez-dz*ex;if(Math.abs(det)<1e-9)continue;const r=(ax*ez-az*ex)/det,u=(ax*dz-az*dx)/det;if(r>0&&u>=0&&u<=1&&r>radii[i])radii[i]=r}}
    let any=false;for(let i=0;i<count;i++)if(radii[i])any=true;
    if(!any){const r=Math.max(1,Math.hypot(base.bounds.max[0]-base.bounds.min[0],base.bounds.max[2]-base.bounds.min[2])/2);radii.fill(r)}
    for(let i=0;i<count;i++)if(!radii[i]){let a=1,b=1;while(!radii[(i-a+count)%count]&&a<count)a++;while(!radii[(i+b)%count]&&b<count)b++;radii[i]=(radii[(i-a+count)%count]*b+radii[(i+b)%count]*a)/(a+b)}
    const arcOf=r=>{const arc=new Float32Array(count+1);for(let i=1;i<=count;i++){const a=(i-1)/count*Math.PI*2,b=i/count*Math.PI*2,ra=r[i-1],rb=r[i%count];arc[i]=arc[i-1]+Math.hypot(ra*Math.cos(a)-rb*Math.cos(b),ra*Math.sin(a)-rb*Math.sin(b))}return arc};
    let arc=arcOf(radii);
    // A textured outside (discs, knurls, ribs) makes the cross-section zigzag: every bump edge adds its height to
    // the arc length, so artwork would be squeezed over bump flanks and a width in mm would cover far too little
    // of the sleeve. Measure along a smooth envelope instead (highs within ~3 mm, then averaged) when the
    // outline is much longer than that envelope. Smooth outlines, corners included, stay on their exact outline.
    const sorted=Float32Array.from(radii).sort(),half=Math.max(1,Math.round(3/Math.max(sorted[count>>1],1e-3)/(Math.PI*2)*count));
    const spread=new Float32Array(count),envelope=new Float32Array(count);
    for(let i=0;i<count;i++){let m=0;for(let d=-half;d<=half;d++)m=Math.max(m,radii[(i+d+count)%count]);spread[i]=m}
    for(let i=0;i<count;i++){let sum=0;for(let d=-half;d<=half;d++)sum+=spread[(i+d+count)%count];envelope[i]=sum/(2*half+1)}
    const smooth=arcOf(envelope);if(smooth[count]*1.1<arc[count])return{arc:smooth,radii:envelope,perimeter:smooth[count],textured:true};
    return{arc,radii,perimeter:arc[count]};
  }
  // Vertex clustering for the interactive preview of very dense meshes. Export uses the full mesh.
  function decimate(base,target=DISPLAY_TRIANGLES){
    const tris=base.indices.length/3;if(tris<=target)return base;
    const ext=base.bounds.max.map((v,a)=>v-base.bounds.min[a]);let cell=Math.cbrt(ext[0]*ext[1]*ext[2]||1)/Math.sqrt(target/2);
    for(let attempt=0;attempt<8;attempt++){
      const P=base.positions,n=P.length/3,map=new Map(),remap=new Uint32Array(n),sums=[];
      for(let i=0;i<n;i++){const key=Math.floor((P[i*3]-base.bounds.min[0])/cell)+','+Math.floor(P[i*3+1]/cell)+','+Math.floor((P[i*3+2]-base.bounds.min[2])/cell);let v=map.get(key);if(v===undefined){v=sums.length/4;map.set(key,v);sums.push(0,0,0,0)}sums[v*4]+=P[i*3];sums[v*4+1]+=P[i*3+1];sums[v*4+2]+=P[i*3+2];sums[v*4+3]++;remap[i]=v}
      const positions=new Float32Array(sums.length/4*3);for(let v=0;v<sums.length/4;v++)for(let a=0;a<3;a++)positions[v*3+a]=sums[v*4+a]/sums[v*4+3];
      const out=[];for(let f=0;f<base.indices.length;f+=3){const a=remap[base.indices[f]],b=remap[base.indices[f+1]],c=remap[base.indices[f+2]];if(a!==b&&b!==c&&c!==a)out.push(a,b,c)}
      if(out.length/3<=target*1.15||attempt===7){const d={...base,positions,indices:new Uint32Array(out),decimated:true,sourceTriangles:tris};d.bounds=bounds(positions);return d}
      cell*=Math.sqrt(out.length/3/target);
    }
  }

  // ---------- Preparation (typed-array port of SleeveTemplate.prepare) ----------
  function buildBVH(P,I){
    const faces=I.length/3,order=new Uint32Array(faces),cent=new Float32Array(faces*3);for(let f=0;f<faces;f++){order[f]=f;for(let a=0;a<3;a++)cent[f*3+a]=(P[I[f*3]*3+a]+P[I[f*3+1]*3+a]+P[I[f*3+2]*3+a])/3}
    const lo=[],hi=[],left=[],right=[],start=[],count=[];
    const make=(s,e)=>{const node=lo.length/3;let l0=Infinity,l1=Infinity,l2=Infinity,h0=-Infinity,h1=-Infinity,h2=-Infinity;
      for(let i=s;i<e;i++){const f=order[i];for(let k=0;k<3;k++){const v=I[f*3+k]*3,x=P[v],y=P[v+1],z=P[v+2];if(x<l0)l0=x;if(x>h0)h0=x;if(y<l1)l1=y;if(y>h1)h1=y;if(z<l2)l2=z;if(z>h2)h2=z}}
      lo.push(l0,l1,l2);hi.push(h0,h1,h2);left.push(-1);right.push(-1);start.push(s);count.push(e-s);
      if(e-s<=8)return node;const ext=[h0-l0,h1-l1,h2-l2],axis=ext[0]>=ext[1]&&ext[0]>=ext[2]?0:ext[1]>=ext[2]?1:2,m=(s+e)>>1;
      // quickselect on the centroid axis
      let a=s,b=e-1;while(b>a){const pv=cent[order[(a+b)>>1]*3+axis];let i=a,j=b;while(i<=j){while(cent[order[i]*3+axis]<pv)i++;while(cent[order[j]*3+axis]>pv)j--;if(i<=j){const t=order[i];order[i]=order[j];order[j]=t;i++;j--}}if(m<=j)b=j;else if(m>=i)a=i;else break}
      const L=make(s,m),R=make(m,e);left[node]=L;right[node]=R;return node};
    make(0,faces);return{lo:Float64Array.from(lo),hi:Float64Array.from(hi),left:Int32Array.from(left),right:Int32Array.from(right),start:Uint32Array.from(start),count:Uint32Array.from(count),order,P,I};
  }
  function rayNearest(t,ox,oy,oz,dx,dy,dz,limit=Infinity){
    let nearest=limit;const stack=[0],P=t.P,I=t.I;
    while(stack.length){const node=stack.pop();let tmin=0,tmax=nearest,ok=true;
      for(let a=0;a<3&&ok;a++){const o=a===0?ox:a===1?oy:oz,d=a===0?dx:a===1?dy:dz,l=t.lo[node*3+a],h=t.hi[node*3+a];if(Math.abs(d)<1e-12){if(o<l-1e-7||o>h+1e-7)ok=false}else{let t1=(l-o)/d,t2=(h-o)/d;if(t1>t2){const x=t1;t1=t2;t2=x}if(t1>tmin)tmin=t1;if(t2<tmax)tmax=t2;if(tmin>tmax)ok=false}}
      if(!ok)continue;if(t.left[node]>=0){stack.push(t.left[node],t.right[node]);continue}
      for(let i=t.start[node],e=i+t.count[node];i<e;i++){const f=t.order[i],a=I[f*3]*3,b=I[f*3+1]*3,c=I[f*3+2]*3,e1x=P[b]-P[a],e1y=P[b+1]-P[a+1],e1z=P[b+2]-P[a+2],e2x=P[c]-P[a],e2y=P[c+1]-P[a+1],e2z=P[c+2]-P[a+2],hx=dy*e2z-dz*e2y,hy=dz*e2x-dx*e2z,hz=dx*e2y-dy*e2x,det=e1x*hx+e1y*hy+e1z*hz;if(Math.abs(det)<1e-10)continue;const inv=1/det,sx=ox-P[a],sy=oy-P[a+1],sz=oz-P[a+2],u=inv*(sx*hx+sy*hy+sz*hz);if(u< -1e-6||u>1+1e-6)continue;const qx=sy*e1z-sz*e1y,qy=sz*e1x-sx*e1z,qz=sx*e1y-sy*e1x,v=inv*(dx*qx+dy*qy+dz*qz);if(v< -1e-6||u+v>1+1e-6)continue;const tt=inv*(e2x*qx+e2y*qy+e2z*qz);if(tt>.002&&tt<nearest)nearest=tt}
    }
    return nearest;
  }
  // Sculpted templates (fabric folds, wrinkles) have small steep patches in the middle of the outer surface. Treated as
  // openings they got the 1.2 mm keep-out band, which bit ragged holes into artwork over them. A patch of non-outer faces
  // that fits in a 3 mm box and touches only outward-facing faces is part of the outer surface; rims, openings, steps
  // and the underside are larger or border other non-outer faces, so they keep their protection.
  function keepSmallFolds(P,I,outer){
    const faces=I.length/3,first=new Map(),parent=new Int32Array(faces).map((_,i)=>i),nearBottom=new Set(),box=new Map();let added=0;
    const find=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x]}return x};
    const pairs=[];
    for(let f=0;f<faces;f++)for(let e=0;e<3;e++){const a=I[f*3+e],b=I[f*3+(e+1)%3],key=a<b?a*4294967296+b:b*4294967296+a,o=first.get(key);if(o===undefined)first.set(key,f);else pairs.push(f,o)}
    for(let k=0;k<pairs.length;k+=2){const f=pairs[k],o=pairs[k+1];if(outer[f]===0&&outer[o]===0)parent[find(f)]=find(o)}
    for(let k=0;k<pairs.length;k+=2){const f=pairs[k],o=pairs[k+1];if(outer[f]===0&&outer[o]===2)nearBottom.add(find(f));if(outer[o]===0&&outer[f]===2)nearBottom.add(find(o))}
    const area=new Float64Array(faces);
    for(let f=0;f<faces;f++){if(outer[f]!==0)continue;const r=find(f);let bb=box.get(r);if(!bb){bb=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];box.set(r,bb)}
      for(let j=0;j<3;j++){const v=I[f*3+j]*3;for(let c=0;c<3;c++){bb[c]=Math.min(bb[c],P[v+c]);bb[c+3]=Math.max(bb[c+3],P[v+c])}}
      const a=I[f*3]*3,c=I[f*3+1]*3,d=I[f*3+2]*3,ux=P[c]-P[a],uy=P[c+1]-P[a+1],uz=P[c+2]-P[a+2],vx=P[d]-P[a],vy=P[d+1]-P[a+1],vz=P[d+2]-P[a+2];area[f]=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)/2}
    for(let f=0;f<faces;f++){if(outer[f]!==0)continue;const r=find(f),bb=box.get(r);if(!nearBottom.has(r)&&bb[3]-bb[0]<3&&bb[4]-bb[1]<3&&bb[5]-bb[2]<3){outer[f]=1;added+=area[f]}}
    return added;
  }
  function classify(P,I){
    const faces=I.length/3,outer=new Uint8Array(faces),fn=new Float32Array(faces*3);let outerArea=0;
    for(let f=0;f<faces;f++){const a=I[f*3]*3,b=I[f*3+1]*3,c=I[f*3+2]*3,ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const area=Math.hypot(nx,ny,nz);if(area>1e-12){nx/=area;ny/=area;nz/=area}else nx=ny=nz=0;fn[f*3]=nx;fn[f*3+1]=ny;fn[f*3+2]=nz;
      let rx=P[a]+P[b]+P[c],rz=P[a+2]+P[b+2]+P[c+2];const rl=Math.hypot(rx,rz);if(rl>1e-12){rx/=rl;rz/=rl}else rx=rz=0;
      // 1 = outward-facing side, 2 = flat face inside the bottom band (underside or inside floor).
      const o=nx*rx+nz*rz>.25&&Math.abs(ny)<.78?1:Math.abs(ny)>.95&&P[a+1]<BOTTOM_BAND&&P[b+1]<BOTTOM_BAND&&P[c+1]<BOTTOM_BAND?2:0;outer[f]=o;if(o)outerArea+=area/2}
    outerArea+=keepSmallFolds(P,I,outer);
    return{outer,fn,outerArea};
  }
  // Pick the finest spacing (not below the quality minimum) whose predicted refinement fits the
  // triangle target. Longest-edge bisection yields about 22 triangles per spacing² of refined area
  // (calibrated on ETSYFOLGER); faces already shorter than the spacing are not refined, so dense
  // inputs are charged only for their existing triangles. The estimate is optimistic for long slivers;
  // prepare() backs off to coarser spacing if the real refinement overflows its budget.
  function chooseSpacing(base,quality){
    const P=base.positions,I=base.indices,{outer}=classify(P,I),min=quality==='print'?.5:1.1,target=quality==='print'?1200000:300000,faces=I.length/3;
    const area=[],longest=[];
    for(let f=0;f<faces;f++){if(!outer[f])continue;let l=0;const a=I[f*3]*3,b=I[f*3+1]*3,c=I[f*3+2]*3;for(const [x,y]of [[a,b],[b,c],[c,a]])l=Math.max(l,(P[x]-P[y])**2+(P[x+1]-P[y+1])**2+(P[x+2]-P[y+2])**2);
      const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];area.push(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)/2);longest.push(Math.sqrt(l))}
    const predicted=s=>{let t=faces;for(let i=0;i<area.length;i++)if(longest[i]>s)t+=Math.max(0,22*area[i]/(s*s)-1);return t};
    let s=min;while(predicted(s)>Math.max(target,faces*1.3)&&s<1000)s*=1.15;return s;
  }
  // ---------- Underside remeshing ----------
  // CAD exporters often triangulate flat bottoms as fans of long, thin triangles. Longest-edge bisection of a fan
  // cascades (every split forces its neighbours to split) and can add over a million vertices, so on dense
  // templates the budget fallback used to leave the bottom with no interior vertices and bottom logos could not
  // be formed. Instead, each planar underside patch gets new interior points on a hexagonal grid at spacing h,
  // inserted into the existing triangulation with Lawson flips (constrained Delaunay insertion). Only interior
  // edges are ever flipped and every point lies strictly inside the patch, so the patch boundary - and the edges
  // shared with the walls - are untouched and the mesh stays watertight. Non-planar or irregular patches are
  // left exactly as they were.
  const PLANE_TOL=2e-3,MAX_UNDERSIDE_POINTS=150000;
  function remeshUnderside(base,h,maxNew=MAX_UNDERSIDE_POINTS){
    if(!(h>0&&Number.isFinite(h))||maxNew<1)return{base,added:0};
    const P=base.positions,I=base.indices,faces=I.length/3,{outer,fn}=classify(P,I);
    const key=(a,b)=>a<b?a*4294967296+b:b*4294967296+a,edgeFaces=new Map();
    for(let f=0;f<faces;f++)if(outer[f]===2)for(let e=0;e<3;e++){const k=key(I[f*3+e],I[f*3+(e+1)%3]),list=edgeFaces.get(k);if(list)list.push(f);else edgeFaces.set(k,[f])}
    if(!edgeFaces.size)return{base,added:0};
    // Group underside faces into patches that share edges and face the same way (within about 1 degree).
    const patchOf=new Int32Array(faces).fill(-1),patches=[];
    for(let f=0;f<faces;f++){if(outer[f]!==2||patchOf[f]>=0)continue;const list=[f],id=patches.length;patchOf[f]=id;
      for(let q=0;q<list.length;q++){const g=list[q];for(let e=0;e<3;e++){const shared=edgeFaces.get(key(I[g*3+e],I[g*3+(e+1)%3]));if(shared.length!==2)continue;const o=shared[0]===g?shared[1]:shared[0];
        if(patchOf[o]<0&&fn[g*3]*fn[o*3]+fn[g*3+1]*fn[o*3+1]+fn[g*3+2]*fn[o*3+2]>.9998){patchOf[o]=id;list.push(o)}}}
      patches.push(list)}
    const newPos=[],newFaces=new Map();let nextVertex=P.length/3,budget=maxNew;
    // Largest patches first, so the budget goes where a logo is most likely to sit.
    const areaOf=f=>{const a=I[f*3]*3,b=I[f*3+1]*3,c=I[f*3+2]*3;return Math.abs((P[b]-P[a])*(P[c+2]-P[a+2])-(P[c]-P[a])*(P[b+2]-P[a+2]))/2};
    const sized=patches.map((list,id)=>({id,list,area:list.reduce((s,f)=>s+areaOf(f),0)})).sort((x,y)=>y.area-x.area);
    for(const patch of sized){
      if(patch.area<4*h*h||budget<1)continue;
      const r=remeshPatch(P,I,patch.list,edgeFaces,key,h,budget,nextVertex);if(!r)continue;
      for(let i=0;i<r.positions.length;i++)newPos.push(r.positions[i]);nextVertex+=r.positions.length/3;budget-=r.positions.length/3;newFaces.set(patch.id,r.indices);
    }
    if(!newFaces.size)return{base,added:0};
    const out=[];for(let f=0;f<faces;f++){const id=patchOf[f];if(id>=0&&newFaces.has(id))continue;out.push(I[f*3],I[f*3+1],I[f*3+2])}
    for(const tris of newFaces.values())for(let i=0;i<tris.length;i++)out.push(tris[i]);
    const positions=new Float32Array(P.length+newPos.length);positions.set(P);positions.set(newPos,P.length);
    return{base:{...base,positions,indices:Uint32Array.from(out)},added:newPos.length/3};
  }
  // Returns {positions,indices} for one patch, or null when the patch is not a clean planar triangulation.
  function remeshPatch(P,I,list,edgeFaces,key,h,maxNew,firstVertex){
    // Plane from the area-weighted normal and centroid; every vertex must lie on it.
    let nx=0,ny=0,nz=0,cx=0,cy=0,cz=0,total=0;
    for(const f of list){const a=I[f*3]*3,b=I[f*3+1]*3,c=I[f*3+2]*3,ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];
      const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx,w=Math.hypot(x,y,z);nx+=x;ny+=y;nz+=z;cx+=(P[a]+P[b]+P[c])*w;cy+=(P[a+1]+P[b+1]+P[c+1])*w;cz+=(P[a+2]+P[b+2]+P[c+2])*w;total+=w*3}
    const nl=Math.hypot(nx,ny,nz);if(!(nl>0)||!(total>0))return null;nx/=nl;ny/=nl;nz/=nl;cx/=total;cy/=total;cz/=total;if(Math.abs(ny)<.95)return null;
    // Local triangulation in the x/z projection (one-to-one because |ny| > 0.95), stored counter-clockwise.
    const local=new Map(),U=[],V=[],global=[];
    const vertexOf=g=>{let l=local.get(g);if(l===undefined){if(Math.abs(nx*(P[g*3]-cx)+ny*(P[g*3+1]-cy)+nz*(P[g*3+2]-cz))>PLANE_TOL)return -1;l=U.length;local.set(g,l);U.push(P[g*3]);V.push(P[g*3+2]);global.push(g)}return l};
    const orient=(a,b,c)=>(U[b]-U[a])*(V[c]-V[a])-(V[b]-V[a])*(U[c]-U[a]);
    const tv=[],tn=[];let sign=0;
    for(const f of list){const a=vertexOf(I[f*3]),b=vertexOf(I[f*3+1]),c=vertexOf(I[f*3+2]);if(a<0||b<0||c<0)return null;
      const o=orient(a,b,c);if(Math.abs(o)<1e-12)return null;const s=o>0?1:-1;if(!sign)sign=s;else if(s!==sign)return null;
      if(sign>0)tv.push(a,b,c);else tv.push(a,c,b);tn.push(-1,-1,-1)}
    // Neighbours across interior edges; patch boundary edges stay -1 and are never flipped.
    const halfEdges=new Map();
    for(let t=0;t<list.length;t++)for(let e=0;e<3;e++){const a=tv[t*3+e],b=tv[t*3+(e+1)%3];if(edgeFaces.get(key(global[a],global[b])).length>2)return null;
      const k=b*4294967296+a,other=halfEdges.get(k);if(other!==undefined){tn[t*3+e]=other>>2;tn[(other>>2)*3+(other&3)]=t}else{if(halfEdges.has(a*4294967296+b))return null;halfEdges.set(a*4294967296+b,t*4+e)}}
    // Candidate points: hexagonal grid over the patch, offset so points rarely land on axis-aligned CAD edges.
    let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity,area=0;
    for(let i=0;i<U.length;i++){minU=Math.min(minU,U[i]);maxU=Math.max(maxU,U[i]);minV=Math.min(minV,V[i]);maxV=Math.max(maxV,V[i])}
    for(let t=0;t<list.length;t++)area+=orient(tv[t*3],tv[t*3+1],tv[t*3+2])/2;
    if(area*1.16/(h*h)>maxNew)h=Math.sqrt(area*1.16/maxNew);
    const rowStep=h*Math.sqrt(3)/2;
    // Bucket grid for point location; triangles are (re)registered whenever their corners change.
    let cell=h*1.5;const spanU=maxU-minU,spanV=maxV-minV;while((spanU/cell+1)*(spanV/cell+1)>4e6)cell*=1.5;
    const gw=Math.floor(spanU/cell)+1,gh=Math.floor(spanV/cell)+1,buckets=new Map();
    const register=t=>{const a=tv[t*3],b=tv[t*3+1],c=tv[t*3+2],v0=Math.min(V[a],V[b],V[c]),v1=Math.max(V[a],V[b],V[c]);
      const r0=Math.max(0,Math.floor((v0-minV)/cell)),r1=Math.min(gh-1,Math.floor((v1-minV)/cell));
      for(let row=r0;row<=r1;row++){const lo=Math.max(v0,minV+row*cell),hi=Math.min(v1,minV+(row+1)*cell);let u0=Infinity,u1=-Infinity;
        // u-range of the triangle inside this row's slab: corners in the slab plus edge crossings of its borders.
        for(let e=0;e<3;e++){const p=e===0?a:e===1?b:c,q=e===0?b:e===1?c:a;if(V[p]>=lo&&V[p]<=hi){if(U[p]<u0)u0=U[p];if(U[p]>u1)u1=U[p]}
          for(let side=0;side<2;side++){const y=side?hi:lo;if((V[p]-y)*(V[q]-y)<0){const u=U[p]+(U[q]-U[p])*(y-V[p])/(V[q]-V[p]);if(u<u0)u0=u;if(u>u1)u1=u}}}
        if(u0>u1)continue;const c0=Math.max(0,Math.floor((u0-minU)/cell)),c1=Math.min(gw-1,Math.floor((u1-minU)/cell));
        for(let col=c0;col<=c1;col++){const k=row*gw+col,b2=buckets.get(k);if(b2)b2.push(t);else buckets.set(k,[t])}}};
    for(let t=0;t<list.length;t++)register(t);
    const locate=(u,v)=>{const k=Math.floor((v-minV)/cell)*gw+Math.floor((u-minU)/cell),cand=buckets.get(k);if(!cand)return -1;
      for(let i=cand.length-1;i>=0;i--){const t=cand[i],a=tv[t*3],b=tv[t*3+1],c=tv[t*3+2],area2=orient(a,b,c);
        const w0=((U[b]-u)*(V[c]-v)-(V[b]-v)*(U[c]-u))/area2,w1=((U[c]-u)*(V[a]-v)-(V[c]-v)*(U[a]-u))/area2,w2=1-w0-w1;
        if(w0>1e-9&&w1>1e-9&&w2>1e-9)return t}return -1};
    const segDist=(u,v,a,b)=>{const dx=U[b]-U[a],dy=V[b]-V[a],l=dx*dx+dy*dy,s=l?Math.max(0,Math.min(1,((u-U[a])*dx+(v-V[a])*dy)/l)):0;return Math.hypot(u-U[a]-s*dx,v-V[a]-s*dy)};
    // d inside the circumcircle of counter-clockwise (a,b,c), with a small margin so near-cocircular grids terminate.
    const inCircle=(a,b,c,d)=>{const ax=U[a]-U[d],ay=V[a]-V[d],bx=U[b]-U[d],by=V[b]-V[d],qx=U[c]-U[d],qy=V[c]-V[d];
      return (ax*ax+ay*ay)*(bx*qy-qx*by)-(bx*bx+by*by)*(ax*qy-qx*ay)+(qx*qx+qy*qy)*(ax*by-bx*ay)>1e-10*h*h*h*h};
    const setNeighbor=(t,from,to)=>{if(t<0)return;for(let e=0;e<3;e++)if(tn[t*3+e]===from){tn[t*3+e]=to;return}};
    let flips=0;const touched=new Set(),flipLimit=64*(maxNew+list.length);
    // Triangles created by insertion keep the new point at corner 2, so edge 0 is the edge to legalize.
    const legalize=(t0)=>{const stack=[t0];while(stack.length){const t=stack.pop(),u=tn[t*3];if(u<0)continue;
      const x=tv[t*3],y=tv[t*3+1],p=tv[t*3+2];let j=0;while(j<3&&tn[u*3+j]!==t)j++;if(j===3)continue;
      const q=tv[u*3+(j+2)%3];if(!inCircle(x,y,p,q))continue;if(orient(x,q,p)<=0||orient(q,y,p)<=0)continue;if(++flips>flipLimit)throw fail('flip limit','REMESH');
      const A=tn[u*3+(j+1)%3],B=tn[u*3+(j+2)%3],C=tn[t*3+1],D=tn[t*3+2];
      // t=(x,y,p) and u=(y,x,q) become t=(x,q,p) and u=(q,y,p).
      tv[t*3]=x;tv[t*3+1]=q;tv[t*3+2]=p;tn[t*3]=A;tn[t*3+1]=u;tn[t*3+2]=D;
      tv[u*3]=q;tv[u*3+1]=y;tv[u*3+2]=p;tn[u*3]=B;tn[u*3+1]=C;tn[u*3+2]=t;
      setNeighbor(A,u,t);setNeighbor(C,t,u);touched.add(t);touched.add(u);stack.push(t,u)}};
    const minGap=h*.5;let added=0;
    // Keep new points away from the patch boundary: at least half a spacing, and 0.9x the boundary edge's length,
    // so the triangle on a boundary edge never has that edge as its longest. Otherwise refinement would split
    // the boundary edge first and cut the neighbouring wall triangles into long slivers.
    const guard=new Map(),gr=[];
    for(let t=0;t<list.length;t++)for(let e=0;e<3;e++){if(tn[t*3+e]>=0)continue;const a=tv[t*3+e],b=tv[t*3+(e+1)%3],r=Math.max(minGap,.9*Math.hypot(U[b]-U[a],V[b]-V[a])),id=gr.length/3;gr.push(a,b,r);
      const c0=Math.max(0,Math.floor((Math.min(U[a],U[b])-r-minU)/cell)),c1=Math.min(gw-1,Math.floor((Math.max(U[a],U[b])+r-minU)/cell)),r0=Math.max(0,Math.floor((Math.min(V[a],V[b])-r-minV)/cell)),r1=Math.min(gh-1,Math.floor((Math.max(V[a],V[b])+r-minV)/cell));
      for(let row=r0;row<=r1;row++)for(let col=c0;col<=c1;col++){const k=row*gw+col,g=guard.get(k);if(g)g.push(id);else guard.set(k,[id])}}
    const nearBoundary=(u,v)=>{const g=guard.get(Math.floor((v-minV)/cell)*gw+Math.floor((u-minU)/cell));if(g)for(const id of g)if(segDist(u,v,gr[id*3],gr[id*3+1])<gr[id*3+2])return true;return false};
    try{
      // Coarse-to-fine order (every 16th grid point first, then 8th, ...): triangles shrink quickly, so few
      // long triangles are re-registered, and a point budget that runs out still leaves even coverage.
      const cand=[],level=(i,j)=>{let l=0;while(l<4&&!((i|j)&((2<<l)-1)))l++;return l};
      for(let row=0,v=minV+h*.377;v<maxV;row++,v+=rowStep)for(let col=0,u=minU+h*.123+(row&1?h/2:0);u<maxU;col++,u+=h){
        // A small deterministic jitter keeps grid rows from lying exactly on edges between earlier grid points.
        const j1=Math.sin(row*12.9898+col*78.233)*43758.5453,j2=Math.sin(row*39.346+col*11.135)*24634.6345;cand.push(level(row,col),u+(j1-Math.floor(j1)-.5)*h*.1,v+(j2-Math.floor(j2)-.5)*h*.1)}
      const order=Array.from({length:cand.length/3},(_,i)=>i).sort((x,y)=>cand[y*3]-cand[x*3]||x-y);
      for(const ci of order){if(added>=maxNew)break;const u=cand[ci*3+1],v=cand[ci*3+2];
        const t=locate(u,v);if(t<0)continue;const a=tv[t*3],b=tv[t*3+1],c=tv[t*3+2];
        if(Math.hypot(u-U[a],v-V[a])<minGap||Math.hypot(u-U[b],v-V[b])<minGap||Math.hypot(u-U[c],v-V[c])<minGap)continue;
        if(nearBoundary(u,v))continue;
        const p=U.length;U.push(u);V.push(v);added++;
        const n0=tn[t*3],n1=tn[t*3+1],n2=tn[t*3+2],t1=tv.length/3,t2=t1+1;
        tv[t*3]=a;tv[t*3+1]=b;tv[t*3+2]=p;tn[t*3]=n0;tn[t*3+1]=t1;tn[t*3+2]=t2;
        tv.push(b,c,p,c,a,p);tn.push(n1,t2,t,n2,t,t1);setNeighbor(n1,t,t1);setNeighbor(n2,t,t2);
        touched.add(t);touched.add(t1);touched.add(t2);legalize(t);legalize(t1);legalize(t2);
        // Register each changed triangle once, with its final corners, before the next point is located.
        for(const x of touched)register(x);touched.clear();
      }
    }catch(e){if(e.code==='REMESH')return null;throw e}
    if(!added)return null;
    const positions=new Float32Array(added*3),base=U.length-added;
    for(let i=0;i<added;i++){const u=U[base+i],v=V[base+i];positions[i*3]=u;positions[i*3+1]=cy-(nx*(u-cx)+nz*(v-cz))/ny;positions[i*3+2]=v}
    const toGlobal=l=>l<base?global[l]:firstVertex+l-base,indices=new Uint32Array(tv.length);
    for(let t=0;t<tv.length/3;t++){const a=toGlobal(tv[t*3]),b=toGlobal(tv[t*3+1]),c=toGlobal(tv[t*3+2]);indices[t*3]=a;if(sign>0){indices[t*3+1]=b;indices[t*3+2]=c}else{indices[t*3+1]=c;indices[t*3+2]=b}}
    return{positions,indices};
  }
  // Budget: 900k vertices, or the input plus 400k for already-dense meshes, capped at 1.1M so sharp-edge
  // export (1.4M-vertex limit) keeps room for contours. If full refinement overflows after coarser retries
  // (or the input alone is near the budget), only faces that are large in both directions are refined, so long
  // slivers are not multiplied. The last resort is the unrefined surface. Every attempt first remeshes flat
  // undersides (remeshUnderside), which keeps bottom branding possible even on the fallbacks.
  function prepare(base,{spacing,quality='preview',onProgress=()=>{},maxPoints}={}){
    if(!spacing)spacing=chooseSpacing(base,quality);
    const vertices=base.positions.length/3,budget=maxPoints||Math.min(1100000,Math.max(900000,vertices+400000)),first=spacing;
    const retry=(e,s)=>{if(e.code!=='DETAIL')throw e;onProgress('Mesh too dense at this spacing; retrying at '+s.toFixed(2)+' mm')};
    for(let attempt=0;attempt<4&&vertices<budget*.9;attempt++){try{return prepareAt(base,spacing,onProgress,budget)}catch(e){spacing*=1.4;retry(e,spacing)}}
    spacing=first;
    for(let attempt=0;attempt<6;attempt++){try{return prepareAt(base,spacing,onProgress,budget,spacing*spacing)}catch(e){spacing*=1.4;retry(e,spacing)}}
    onProgress('Using the original triangles without refinement');return prepareAt(base,Infinity,onProgress,Infinity,0,first,Math.max(0,Math.min(60000,budget-vertices)));
  }
  // minArea (optional): only split faces with at least this area (skips long thin slivers).
  // bottomSpacing/bottomPoints: target spacing and point budget for remeshing flat undersides (see remeshUnderside).
  function prepareAt(base,spacing,onProgress,maxPoints,minArea=0,bottomSpacing=spacing,bottomPoints){
    if(Number.isFinite(bottomSpacing)){
      const room=Number.isFinite(maxPoints)?Math.floor((maxPoints-base.positions.length/3)/2):MAX_UNDERSIDE_POINTS;
      onProgress('Remeshing flat underside');base=remeshUnderside(base,bottomSpacing*.8,Math.min(bottomPoints??MAX_UNDERSIDE_POINTS,room)).base;
    }
    const P0=base.positions,I0=base.indices,faces0=I0.length/3,{outer:faceOuter,fn}=classify(P0,I0);
    let nPts=P0.length/3,cap=Math.max(nPts*2,1024);let P=new Float64Array(cap*3),N=new Float64Array(cap*3);P.set(P0);
    for(let f=0;f<faces0;f++)if(faceOuter[f])for(let j=0;j<3;j++){const i=I0[f*3+j],pj=I0[f*3+(j+1)%3],pk=I0[f*3+(j+2)%3];let ux=P[pj*3]-P[i*3],uy=P[pj*3+1]-P[i*3+1],uz=P[pj*3+2]-P[i*3+2],vx=P[pk*3]-P[i*3],vy=P[pk*3+1]-P[i*3+1],vz=P[pk*3+2]-P[i*3+2];const lu=Math.hypot(ux,uy,uz)||1,lv=Math.hypot(vx,vy,vz)||1;const angle=Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy+uz*vz)/(lu*lv))));for(let a=0;a<3;a++)N[i*3+a]+=fn[f*3+a]*angle}
    for(let i=0;i<nPts;i++){const l=Math.hypot(N[i*3],N[i*3+1],N[i*3+2]);if(l>1e-12)for(let a=0;a<3;a++)N[i*3+a]/=l;else N[i*3]=N[i*3+1]=N[i*3+2]=0}
    onProgress('Indexing surface');const tree=buildBVH(P0,I0);
    let tris=new Uint32Array(I0),tags=Uint8Array.from(faceOuter);
    const grow=need=>{if(need<=cap)return;cap=Math.max(need,cap*2);const p=new Float64Array(cap*3);p.set(P);P=p;const n=new Float64Array(cap*3);n.set(N);N=n};
    const s2=spacing*spacing,triArea=f=>{const a=tris[f*3]*3,b=tris[f*3+1]*3,c=tris[f*3+2]*3,ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];return Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)/2};
    for(let pass=0;pass<24;pass++){
      const split=new Map(),key=(a,b)=>a<b?a*4294967296+b:b*4294967296+a;const nf=tris.length/3;
      for(let f=0;f<nf;f++){if(!tags[f]||minArea&&triArea(f)<minArea)continue;let longest=s2,edge=-1;for(let e=0;e<3;e++){const a=tris[f*3+e]*3,b=tris[f*3+(e+1)%3]*3,l=(P[a]-P[b])**2+(P[a+1]-P[b+1])**2+(P[a+2]-P[b+2])**2;if(l>longest){longest=l;edge=e}}if(edge<0)continue;
        const a=tris[f*3+edge],b=tris[f*3+(edge+1)%3],k=key(a,b);if(split.has(k))continue;grow(nPts+1);const m=nPts++;split.set(k,m);for(let x=0;x<3;x++){P[m*3+x]=(P[a*3+x]+P[b*3+x])/2;N[m*3+x]=N[a*3+x]+N[b*3+x]}const l=Math.hypot(N[m*3],N[m*3+1],N[m*3+2]);if(l>1e-12)for(let x=0;x<3;x++)N[m*3+x]/=l}
      if(!split.size)break;if(nPts>maxPoints)throw fail('Template detail is too high for spacing '+spacing.toFixed(2)+' mm.','DETAIL');
      const next=[],nextTags=[];
      for(let f=0;f<nf;f++){const a=tris[f*3],b=tris[f*3+1],c=tris[f*3+2],ab=split.get(key(a,b)),bc=split.get(key(b,c)),ca=split.get(key(c,a)),t=tags[f];
        const bits=(ab!==undefined?1:0)+(bc!==undefined?2:0)+(ca!==undefined?4:0);let out;
        switch(bits){case 0:out=[a,b,c];break;case 1:out=[a,ab,c,ab,b,c];break;case 2:out=[b,bc,a,bc,c,a];break;case 4:out=[c,ca,b,ca,a,b];break;case 3:out=[b,bc,ab,a,ab,c,ab,bc,c];break;case 5:out=[a,ab,ca,ab,b,c,ab,c,ca];break;case 6:out=[c,ca,bc,a,b,ca,b,bc,ca];break;case 7:out=[a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca];break}
        for(let i=0;i<out.length;i++)next.push(out[i]);for(let i=0;i<out.length/3;i++)nextTags.push(t)}
      tris=Uint32Array.from(next);tags=Uint8Array.from(nextTags);onProgress('Refining surface: '+nPts.toLocaleString()+' vertices');
    }
    onProgress('Protecting rims and openings');
    const membership=new Uint8Array(nPts),nf=tris.length/3,deg=new Uint32Array(nPts+1);
    for(let f=0;f<nf;f++)for(let e=0;e<3;e++){membership[tris[f*3+e]]|=tags[f]?1:2;if(tags[f]){deg[tris[f*3+e]+1]++;deg[tris[f*3+(e+1)%3]+1]++}}
    for(let i=0;i<nPts;i++)deg[i+1]+=deg[i];const cur=deg.slice(0,nPts),nb=new Uint32Array(deg[nPts]),nl=new Float32Array(deg[nPts]);
    for(let f=0;f<nf;f++)if(tags[f])for(let e=0;e<3;e++){const a=tris[f*3+e],b=tris[f*3+(e+1)%3],l=Math.hypot(P[a*3]-P[b*3],P[a*3+1]-P[b*3+1],P[a*3+2]-P[b*3+2]);nb[cur[a]]=b;nl[cur[a]++]=l;nb[cur[b]]=a;nl[cur[b]++]=l}
    const distance=new Float32Array(nPts).fill(1.2),hid=[],hd=[];
    const push=(id,d)=>{hid.push(id);hd.push(d);let i=hid.length-1;while(i){const p=(i-1)>>1;if(hd[p]<=d)break;hid[i]=hid[p];hd[i]=hd[p];i=p}hid[i]=id;hd[i]=d};
    const pop=()=>{const id=hid[0],d=hd[0],li=hid.pop(),ld=hd.pop();if(hid.length){let i=0;for(;;){let c=i*2+1;if(c>=hid.length)break;if(c+1<hid.length&&hd[c+1]<hd[c])c++;if(ld<=hd[c])break;hid[i]=hid[c];hd[i]=hd[c];i=c}hid[i]=li;hd[i]=ld}return[id,d]};
    for(let i=0;i<nPts;i++)if(membership[i]!==1){distance[i]=0;if(membership[i]===3)push(i,0)}
    while(hid.length){const[id,d]=pop();if(d>distance[id]+1e-6)continue;for(let k=deg[id];k<deg[id+1];k++){const j=nb[k],nd=d+nl[k];if(nd<distance[j]){distance[j]=nd;push(j,nd)}}}
    onProgress('Measuring wall thickness');
    // Relief only needs walls up to 3.8 mm (0.8 mm guard + 3 mm maximum deboss). On a closed mesh an inward ray
    // always hits, so rays stop at 4 mm and "farther" is stored as 4 - identical results, far fewer BVH visits.
    // Open meshes keep unlimited rays so escaping rays stay Infinity (no relief where the wall is unknown).
    const rayLimit=base.closed?WALL_CAP:Infinity;
    const thickness=new Float32Array(nPts),uv=new Float32Array(nPts),chart=base.chart||profile(base);let outerCount=0,thin=0;
    for(let i=0;i<nPts;i++){uv[i]=SleeveTemplateArc(chart,Math.atan2(P[i*3+2],P[i*3]));if(membership[i]===1&&distance[i]>.001){outerCount++;const t=rayNearest(tree,P[i*3],P[i*3+1],P[i*3+2],-N[i*3],-N[i*3+1],-N[i*3+2],rayLimit);thickness[i]=t;if(!(t>=1.6))thin++}
      if(i&&i%100000===0)onProgress('Measuring wall thickness: '+Math.round(i/nPts*100)+'%')}
    return{positions:Float32Array.from(P.subarray(0,nPts*3)),normals:Float32Array.from(N.subarray(0,nPts*3)),indices:tris,distance,thickness,uv,outer:Uint8Array.from(membership,x=>x&1),chart,height:base.height,spacing,texture:textureMap(P,tris,tags,thickness,chart,base.height),stats:{outerVertices:outerCount,thinVertices:thin,triangles:nf,vertices:nPts}};
  }
  // ---------- Textured surfaces ----------
  // Templates whose outside is covered in bumps (domes, discs, knurling, ribs) break a draped relief into pieces:
  // every bump edge counts as a rim (keep-out band), steep bump walls face sideways or up/down and get no relief,
  // and thin walls in the recesses suppress it too. So for textured templates an embossed design is built as a
  // separate raised "pad" instead: its top follows the smooth envelope over the bumps (plus the design depth),
  // its bottom is sunk below the recesses, and the two are joined by vertical walls along the artwork contour.
  // The pad is a closed shell that overlaps the template; slicers merge overlapping shells of one object.
  // textureMap() samples the outer skin on a grid over (arc length, height); buildTexturePads() uses it.
  const TEXTURE_CELL=.5,TEXTURE_MIN_DEPTH=.5,PAD_KEEP_OUT=1.2,PAD_EMBED=.3,PAD_MAX_POINTS=600000;
  // Separable sliding filters on a cols×rows grid; columns wrap around the sleeve, rows are clamped.
  function gridFilter(src,cols,rows,radius,op){
    const k=Math.max(0,Math.round(radius/TEXTURE_CELL)),tmp=new Float32Array(src.length),out=new Float32Array(src.length);if(!k){out.set(src);return out}
    const pick=op==='max'?Math.max:op==='min'?Math.min:null;
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){let v=pick?src[y*cols+x]:0;for(let d=-k;d<=k;d++){const s=src[y*cols+((x+d)%cols+cols)%cols];v=pick?pick(v,s):v+s}tmp[y*cols+x]=pick?v:v/(2*k+1)}
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){let v=pick?tmp[y*cols+x]:0,n=0;for(let d=-k;d<=k;d++){const yy=y+d;if(yy<0||yy>=rows)continue;const s=tmp[yy*cols+x];v=pick?pick(v,s):v+s;n++}out[y*cols+x]=pick?v:v/n}
    return out;
  }
  function textureMap(P,tris,tags,thickness,chart,height){
    const cell=TEXTURE_CELL,cols=Math.max(3,Math.ceil(chart.perimeter/cell)),rows=Math.max(3,Math.ceil(height/cell)+1),n=cols*rows;
    const env=new Float32Array(n).fill(-Infinity),floor=new Float32Array(n).fill(Infinity),inner=new Float32Array(n).fill(-Infinity);
    // Sample every outer side face densely (not just its vertices), so coarse meshes - a box is 12 triangles -
    // fill the grid evenly. Up/down-facing faces (ends, flange tops, undersides) are skipped.
    const step=cell*.5;
    for(let f=0;f<tris.length/3;f++){
      if(!tags[f])continue;const a=tris[f*3],b=tris[f*3+1],c=tris[f*3+2];
      const ux=P[b*3]-P[a*3],uy=P[b*3+1]-P[a*3+1],uz=P[b*3+2]-P[a*3+2],vx=P[c*3]-P[a*3],vy=P[c*3+1]-P[a*3+1],vz=P[c*3+2]-P[a*3+2];
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.hypot(nx,ny,nz);if(!(len>1e-12)||Math.abs(ny/len)>=.78)continue;
      const edge=Math.sqrt(Math.max(ux*ux+uy*uy+uz*uz,vx*vx+vy*vy+vz*vz,(vx-ux)**2+(vy-uy)**2+(vz-uz)**2)),m=Math.min(64,Math.max(1,Math.ceil(edge/step)));
      const ta=thickness[a],tb=thickness[b],tc=thickness[c],known=ta>0&&tb>0&&tc>0&&Number.isFinite(ta+tb+tc);
      for(let i=0;i<=m;i++)for(let j=0;j<=m-i;j++){const wb=i/m,wc=j/m,wa=1-wb-wc,x=P[a*3]+ux*wb+vx*wc,y=P[a*3+1]+uy*wb+vy*wc,z=P[a*3+2]+uz*wb+vz*wc;
        const gx=Math.min(cols-1,Math.floor(SleeveTemplateArc(chart,Math.atan2(z,x))/cell)),gy=Math.min(rows-1,Math.max(0,Math.floor(y/cell))),k=gy*cols+gx,r=Math.hypot(x,z);
        if(r>env[k])env[k]=r;if(r<floor[k])floor[k]=r;if(known){const q=r-(ta*wa+tb*wb+tc*wc);if(q>inner[k])inner[k]=q}}
    }
    // Close pinholes (bins that fall between the vertices of a coarse surface) from their neighbours.
    for(let pass=0;pass<3;pass++){let filled=0;const e0=env.slice(),f0=floor.slice(),i0=inner.slice();
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const k=y*cols+x;if(e0[k]>-Infinity)continue;let e=-Infinity,f=Infinity,q=-Infinity;
        for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const yy=y+dy;if(yy<0||yy>=rows)continue;const j=yy*cols+((x+dx)%cols+cols)%cols;if(e0[j]>e)e=e0[j];if(f0[j]<f)f=f0[j];if(i0[j]>q)q=i0[j]}
        if(e>-Infinity){env[k]=e;floor[k]=f;inner[k]=q;filled++}}
      if(!filled)break}
    // Distance (mm) from each bin to the nearest bin without skin - openings, rims and the ends of the template.
    const valid=new Float32Array(n);for(let k=0;k<n;k++)valid[k]=env[k]>-Infinity?1e6:0;
    const diag=cell*Math.SQRT2;
    for(let pass=0;pass<2;pass++){
      for(let y=0;y<rows;y++)for(let xi=0;xi<2*cols;xi++){const x=xi%cols,k=y*cols+x,l=y*cols+(x+cols-1)%cols;let v=Math.min(valid[k],valid[l]+cell);if(y){const u=(y-1)*cols;v=Math.min(v,valid[u+x]+cell,valid[u+(x+cols-1)%cols]+diag,valid[u+(x+1)%cols]+diag)}valid[k]=v}
      for(let y=rows-1;y>=0;y--)for(let xi=2*cols-1;xi>=0;xi--){const x=xi%cols,k=y*cols+x,l=y*cols+(x+1)%cols;let v=Math.min(valid[k],valid[l]+cell);if(y<rows-1){const u=(y+1)*cols;v=Math.min(v,valid[u+x]+cell,valid[u+(x+cols-1)%cols]+diag,valid[u+(x+1)%cols]+diag)}valid[k]=v}
    }
    for(let k=0;k<n;k++){if(!(env[k]>-Infinity)){env[k]=0;floor[k]=0;inner[k]=0}else if(!(inner[k]>-Infinity))inner[k]=floor[k]-4;const yc=(Math.floor(k/cols)+.5)*cell;valid[k]=Math.max(0,Math.min(valid[k]-cell/2,yc,height-yc))}
    // Texture depth: spread between the skin's highs and lows within 3 mm, minus the same spread of a 4 mm
    // average, so slopes and corners of a smooth wall (a box, a tapered or oval sleeve) do not count. Taken as the median over the usable area, so a
    // few features on an otherwise smooth template (a flange, a handle, a molded label) do not make it "textured".
    // It must also agree with the cross-section (profile(): the outline zigzags, see chart.textured), which rules
    // out plates and other shapes whose radius swings widely without any surface texture.
    const trend=gridFilter(env,cols,rows,4,'mean'),hi=gridFilter(env,cols,rows,3,'max'),lo=gridFilter(floor,cols,rows,3,'min'),trendHi=gridFilter(trend,cols,rows,3,'max'),trendLo=gridFilter(trend,cols,rows,3,'min');
    const spread=[];for(let k=0;k<n;k++)if(valid[k]>3)spread.push(hi[k]-lo[k]-(trendHi[k]-trendLo[k]));spread.sort((a,b)=>a-b);const depth=spread.length?spread[Math.floor(spread.length*.5)]:0;
    // Pad top: the skin's highs spread 3.5 mm then averaged over 1.5 mm, which stays at or above every bump within
    // 2 mm while bridging the recesses. Capped at the local lows plus the texture depth, so a flange or handle next
    // to the design cannot lift the pad. Pad bottom: the local lows minus the embed, but clear of the cavity.
    const lows=gridFilter(floor,cols,rows,3.5,'min'),capped=gridFilter(env,cols,rows,3.5,'max').map((v,k)=>Math.min(v,lows[k]+depth+.2));
    const top=gridFilter(capped,cols,rows,1.5,'mean'),near=gridFilter(floor,cols,rows,1,'min'),cavity=gridFilter(inner,cols,rows,1,'max');
    const bottom=near.map((v,k)=>Math.max(v-PAD_EMBED,Math.min(v-.05,cavity[k]+.3)));
    return{cell,cols,rows,perimeter:chart.perimeter,height,depth,textured:!!chart.textured&&depth>=TEXTURE_MIN_DEPTH,top,bottom,valid};
  }
  function sampleGrid(t,field,s,y){
    const gx=(((s/t.cell-.5)%t.cols)+t.cols)%t.cols,gy=Math.max(0,Math.min(t.rows-1,y/t.cell-.5)),x0=Math.floor(gx),y0=Math.floor(gy),x1=(x0+1)%t.cols,y1=Math.min(t.rows-1,y0+1),fx=gx-x0,fy=gy-y0;
    return (field[y0*t.cols+x0]*(1-fx)+field[y0*t.cols+x1]*fx)*(1-fy)+(field[y1*t.cols+x0]*(1-fx)+field[y1*t.cols+x1]*fx)*fy;
  }
  // Builds one closed pad shell per design. Returns {positions,indices,walls,counts} where counts[j] is the
  // number of pad-top grid points of design j (0 = the design is not on a usable part of the surface).
  function buildTexturePads(prepared,designs,{spacing=.24,maxHeight=.4}={}){
    const t=prepared.texture,chart=prepared.chart,S=globalThis.SharpSleeve,T=globalThis.SleeveTemplate;
    const positions=[],indices=[],walls=[],counts=[];
    for(const source of designs){
      const w=Math.max(2,Math.min(chart.perimeter,source.designWidth||30)),h=Math.max(2,Math.min(prepared.height,source.designHeight||30)),depth=Math.max(0,Math.min(3,source.maxHeight??maxHeight));
      const d={...source,designWidth:w,designHeight:h,contour:S.contourField(source.sharp===false?{...source,designWidth:w,designHeight:h,smoothContours:false,heightmap:Float32Array.from(source.heightmap,v=>Math.min(1,v*500))}:{...source,designWidth:w,designHeight:h})};
      const rot=(source.designRotation||0)*Math.PI/180,c=Math.cos(rot),s=Math.sin(rot),centerS=T.arcAt(chart,(source.designAngle||0)*Math.PI/180+Math.PI/2),centerY=source.designY??prepared.height/2;
      const g=Math.max(spacing,Math.sqrt(w*h/PAD_MAX_POINTS)),nx=Math.max(2,Math.ceil(w/g))+1,ny=Math.max(2,Math.ceil(h/g))+1,gx=w/(nx-1),gy=h/(ny-1);
      // Grid point (i,j) -> sleeve coordinates; x runs against arc length (the artwork's left is at larger arc).
      const where=(x,y)=>{const dx=x*c-y*s,dy=x*s+y*c;return[centerS-dx,centerY+dy]};
      const strength=(u,v)=>{if(source.sharp!==false)return 1;const hm=source.heightmap,X=Math.max(0,Math.min(1,u))*(source.cols-1),Y=Math.max(0,Math.min(1,v))*(source.rows-1),a=Math.floor(X),b=Math.floor(Y),a1=Math.min(a+1,source.cols-1),b1=Math.min(b+1,source.rows-1),fx=X-a,fy=Y-b;return (hm[b*source.cols+a]*(1-fx)+hm[b*source.cols+a1]*fx)*(1-fy)+(hm[b1*source.cols+a]*(1-fx)+hm[b1*source.cols+a1]*fx)*fy};
      const field=new Float32Array(nx*ny);let inside=0;
      for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=-w/2+i*gx,y=-h/2+j*gy,[sa,yy]=where(x,y);
        // Signed distance (mm, positive inside) to the artwork contour, limited by the keep-out around rims and openings.
        let f=S.sampleDistance(d,x/w+.5,.5-y/h);const keep=yy<0||yy>prepared.height?-1:sampleGrid(t,t.valid,sa,yy)-PAD_KEEP_OUT;f=Math.min(f,keep);if(Math.abs(f)<1e-7)f=1e-7;field[j*nx+i]=f;if(f>0)inside++}
      counts.push(inside);if(!inside)continue;
      // Marching triangles over the grid: inside points and edge crossings become pad-top vertices.
      const px=[],py=[],ph=[],gridTop=new Int32Array(nx*ny).fill(-1),cut=new Map();
      const addPoint=(x,y)=>{px.push(x);py.push(y);const u=x/w+.5,v=.5-y/h;ph.push(depth*strength(u,v));return px.length-1};
      const topOf=k=>{if(gridTop[k]<0)gridTop[k]=addPoint(-w/2+(k%nx)*gx,-h/2+Math.floor(k/nx)*gy);return gridTop[k]};
      const cutOf=(a,b)=>{const key=a<b?a*nx*ny+b:b*nx*ny+a;let id=cut.get(key);if(id===undefined){const fa=field[a],fb=field[b],q=Math.max(.05,Math.min(.95,fa/(fa-fb)));id=addPoint(-w/2+((a%nx)+((b%nx)-(a%nx))*q)*gx,-h/2+(Math.floor(a/nx)+(Math.floor(b/nx)-Math.floor(a/nx))*q)*gy);cut.set(key,id)}return id};
      const faces=[],segs=[];
      const tri=(a,b,e)=>{const ids=[a,b,e],inn=ids.map(k=>field[k]>0);if(!inn[0]&&!inn[1]&&!inn[2])return;const poly=[];
        for(let q=0;q<3;q++){const p=ids[q],r=ids[(q+1)%3];if(inn[q])poly.push({id:topOf(p),cut:false});if(inn[q]!==inn[(q+1)%3])poly.push({id:cutOf(p,r),cut:true})}
        for(let q=1;q<poly.length-1;q++)faces.push(poly[0].id,poly[q].id,poly[q+1].id);
        for(let q=0;q<poly.length;q++){const A=poly[q],B=poly[(q+1)%poly.length];if(A.cut&&B.cut)segs.push(A.id,B.id)}};
      for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){const k=j*nx+i;tri(k,k+1,k+nx+1);tri(k,k+nx+1,k+nx)}
      // Emit top and bottom vertices in sleeve space.
      const base=positions.length/3,count=px.length;
      for(let pass=0;pass<2;pass++)for(let q=0;q<count;q++){const [sa,yy]=where(px[q],py[q]),angle=T.angleAt(chart,sa),r=pass?sampleGrid(t,t.bottom,sa,yy):sampleGrid(t,t.top,sa,yy)+ph[q];positions.push(r*Math.cos(angle),yy,r*Math.sin(angle))}
      // Orientation: the design grid is mirrored relative to the sleeve, so choose the winding whose top faces point outward.
      const shell=[];for(let q=0;q<faces.length;q+=3)shell.push(base+faces[q],base+faces[q+1],base+faces[q+2],base+count+faces[q],base+count+faces[q+2],base+count+faces[q+1]);
      const wallStart=[];for(let q=0;q<segs.length;q+=2){const A=base+segs[q],B=base+segs[q+1];wallStart.push(shell.length/3);shell.push(B,A,A+count,B,A+count,B+count)}
      const a=shell[0]*3,b=shell[1]*3,e=shell[2]*3,ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[e]-positions[a],vy=positions[e+1]-positions[a+1],vz=positions[e+2]-positions[a+2];
      const outward=(uy*vz-uz*vy)*positions[a]+(ux*vy-uy*vx)*positions[a+2]>0;
      if(!outward)for(let q=0;q<shell.length;q+=3){const x=shell[q+1];shell[q+1]=shell[q+2];shell[q+2]=x}
      const first=indices.length/3;for(const f of wallStart)walls.push(first+f,first+f+1);for(const v of shell)indices.push(v);
    }
    return{positions:new Float32Array(positions),indices:new Uint32Array(indices),walls:new Uint32Array(walls),counts};
  }
  function SleeveTemplateArc(chart,angle){const tau=Math.PI*2,t=((angle%tau)+tau)%tau/tau*(chart.arc.length-1),i=Math.floor(t);return chart.arc[i]+(chart.arc[Math.min(i+1,chart.arc.length-1)]-chart.arc[i])*(t-i)}

  // ---------- Serialization for project files ----------
  function toBinarySTL(positions,indices,header='Caviot custom template'){
    const count=indices.length/3,buf=new ArrayBuffer(84+count*50),view=new DataView(buf),bytes=new Uint8Array(buf);for(let i=0;i<Math.min(80,header.length);i++)bytes[i]=header.charCodeAt(i)&127;view.setUint32(80,count,true);
    for(let f=0;f<count;f++){const o=84+f*50;for(let v=0;v<3;v++)for(let a=0;a<3;a++)view.setFloat32(o+12+v*12+a*4,positions[indices[f*3+v]*3+a],true)}return buf;
  }
  function describeProblems(r){
    const issues=[];
    if(r.boundary)issues.push(r.boundary.toLocaleString()+' open edge'+(r.boundary===1?'':'s')+' (holes)');
    if(r.nonManifold)issues.push(r.nonManifold.toLocaleString()+' non-manifold edge'+(r.nonManifold===1?'':'s'));
    if(r.windingConflicts)issues.push(r.windingConflicts.toLocaleString()+' faces with conflicting orientation');
    if(r.zeroArea)issues.push(r.zeroArea.toLocaleString()+' collapsed faces');
    return issues;
  }
  return{MAX_BYTES,MAX_TRIANGLES,DISPLAY_TRIANGLES,UP_AXES,TURNS,UNITS,parseSTL,remeshUnderside,weld,edgeTable,fixOrientation,analyze,load,orient,profile,decimate,chooseSpacing,prepare,keepSmallFolds,bounds,normalizeOrientation,toBinarySTL,describeProblems,signedVolume,textureMap,buildTexturePads,TEXTURE_MIN_DEPTH};
})();
