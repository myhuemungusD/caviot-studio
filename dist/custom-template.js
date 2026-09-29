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
    if(!/^\s*solid\b/i.test(head)){
      if(buffer.byteLength>=84)throw fail('This is not a valid STL: the binary triangle count does not match the file size (the file may be truncated), and it is not ASCII STL.','BAD_FORMAT');
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
  function normalizeOrientation(o={}){return{up:UP_AXES.includes(o.up)?o.up:'auto',turn:TURNS.includes(Number(o.turn))?Number(o.turn):0,units:Object.hasOwn(UNITS,o.units)?o.units:'mm',autoAlign:o.autoAlign!==false}}
  function slicePoints(positions,indices,y){const pts=[];for(let f=0;f<indices.length;f+=3)for(let e=0;e<3;e++){const a=indices[f+e]*3,b=indices[f+(e+1)%3]*3,ya=positions[a+1],yb=positions[b+1];if((ya<y)!==(yb<y)){const t=(y-ya)/(yb-ya);pts.push(positions[a]+t*(positions[b]-positions[a]),positions[a+2]+t*(positions[b+2]-positions[a+2]))}}return pts}
  function orient(source,orientation={}){
    const o=normalizeOrientation(orientation),src=source.positions,b0=bounds(src),ext=b0.max.map((v,a)=>v-b0.min[a]);
    let up=o.up;if(up==='auto'){const axis=ext[2]>=ext[0]&&ext[2]>=ext[1]?2:ext[1]>=ext[0]?1:0;up='+'+'xyz'[axis]}
    const map=upMaps[up],scale=UNITS[o.units],n=src.length/3,out=new Float32Array(src.length);
    for(let i=0;i<n;i++){const p=map([src[i*3],src[i*3+1],src[i*3+2]]);out[i*3]=p[0]*scale;out[i*3+1]=p[1]*scale;out[i*3+2]=p[2]*scale}
    let b=bounds(out);const cx=(b.min[0]+b.max[0])/2,cz=(b.min[2]+b.max[2])/2,mid=(b.min[1]+b.max[1])/2;
    let angle=0;
    if(o.autoAlign){let pts=slicePoints(out,source.indices,mid);if(pts.length<6){pts=[];for(let i=0;i<n;i++)pts.push(out[i*3],out[i*3+2])}let xx=0,xz=0,zz=0;for(let i=0;i<pts.length;i+=2){const x=pts[i]-cx,z=pts[i+1]-cz;xx+=x*x;xz+=x*z;zz+=z*z}angle=.5*Math.atan2(2*xz,xx-zz)}
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
    const arc=new Float32Array(count+1);for(let i=1;i<=count;i++){const a=(i-1)/count*Math.PI*2,b=i/count*Math.PI*2,ra=radii[i-1],rb=radii[i%count];arc[i]=arc[i-1]+Math.hypot(ra*Math.cos(a)-rb*Math.cos(b),ra*Math.sin(a)-rb*Math.sin(b))}
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
  function classify(P,I){
    const faces=I.length/3,outer=new Uint8Array(faces),fn=new Float32Array(faces*3);let outerArea=0;
    for(let f=0;f<faces;f++){const a=I[f*3]*3,b=I[f*3+1]*3,c=I[f*3+2]*3,ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const area=Math.hypot(nx,ny,nz);if(area>1e-12){nx/=area;ny/=area;nz/=area}else nx=ny=nz=0;fn[f*3]=nx;fn[f*3+1]=ny;fn[f*3+2]=nz;
      let rx=P[a]+P[b]+P[c],rz=P[a+2]+P[b+2]+P[c+2];const rl=Math.hypot(rx,rz);if(rl>1e-12){rx/=rl;rz/=rl}else rx=rz=0;
      const o=(nx*rx+nz*rz>.25&&Math.abs(ny)<.78)||(Math.abs(ny)>.95&&P[a+1]<BOTTOM_BAND&&P[b+1]<BOTTOM_BAND&&P[c+1]<BOTTOM_BAND);outer[f]=o?1:0;if(o)outerArea+=area/2}
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
  // Budget: 900k vertices, or the input plus 400k for already-dense meshes. If refinement still
  // overflows after coarser retries, the surface is used unrefined (always within budget).
  function prepare(base,{spacing,quality='preview',onProgress=()=>{},maxPoints}={}){
    if(!spacing)spacing=chooseSpacing(base,quality);
    const budget=maxPoints||Math.max(900000,base.positions.length/3+400000);
    for(let attempt=0;attempt<4;attempt++){try{return prepareAt(base,spacing,onProgress,budget)}catch(e){if(e.code!=='DETAIL')throw e;spacing*=1.4;onProgress('Mesh too dense at this spacing; retrying at '+spacing.toFixed(2)+' mm')}}
    onProgress('Using the original triangles without refinement');return prepareAt(base,Infinity,onProgress,Infinity);
  }
  function prepareAt(base,spacing,onProgress,maxPoints){
    const P0=base.positions,I0=base.indices,faces0=I0.length/3,{outer:faceOuter,fn}=classify(P0,I0);
    let nPts=P0.length/3,cap=Math.max(nPts*2,1024);let P=new Float64Array(cap*3),N=new Float64Array(cap*3);P.set(P0);
    for(let f=0;f<faces0;f++)if(faceOuter[f])for(let j=0;j<3;j++){const i=I0[f*3+j],pj=I0[f*3+(j+1)%3],pk=I0[f*3+(j+2)%3];let ux=P[pj*3]-P[i*3],uy=P[pj*3+1]-P[i*3+1],uz=P[pj*3+2]-P[i*3+2],vx=P[pk*3]-P[i*3],vy=P[pk*3+1]-P[i*3+1],vz=P[pk*3+2]-P[i*3+2];const lu=Math.hypot(ux,uy,uz)||1,lv=Math.hypot(vx,vy,vz)||1;const angle=Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy+uz*vz)/(lu*lv))));for(let a=0;a<3;a++)N[i*3+a]+=fn[f*3+a]*angle}
    for(let i=0;i<nPts;i++){const l=Math.hypot(N[i*3],N[i*3+1],N[i*3+2]);if(l>1e-12)for(let a=0;a<3;a++)N[i*3+a]/=l;else N[i*3]=N[i*3+1]=N[i*3+2]=0}
    onProgress('Indexing surface');const tree=buildBVH(P0,I0);
    let tris=new Uint32Array(I0),tags=Uint8Array.from(faceOuter);
    const grow=need=>{if(need<=cap)return;cap=Math.max(need,cap*2);const p=new Float64Array(cap*3);p.set(P);P=p;const n=new Float64Array(cap*3);n.set(N);N=n};
    const s2=spacing*spacing;
    for(let pass=0;pass<24;pass++){
      const split=new Map(),key=(a,b)=>a<b?a*4294967296+b:b*4294967296+a;const nf=tris.length/3;
      for(let f=0;f<nf;f++){if(!tags[f])continue;let longest=s2,edge=-1;for(let e=0;e<3;e++){const a=tris[f*3+e]*3,b=tris[f*3+(e+1)%3]*3,l=(P[a]-P[b])**2+(P[a+1]-P[b+1])**2+(P[a+2]-P[b+2])**2;if(l>longest){longest=l;edge=e}}if(edge<0)continue;
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
    return{positions:Float32Array.from(P.subarray(0,nPts*3)),normals:Float32Array.from(N.subarray(0,nPts*3)),indices:tris,distance,thickness,uv,outer:Uint8Array.from(membership,x=>x&1),chart,height:base.height,spacing,stats:{outerVertices:outerCount,thinVertices:thin,triangles:nf,vertices:nPts}};
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
  return{MAX_BYTES,MAX_TRIANGLES,DISPLAY_TRIANGLES,UP_AXES,TURNS,UNITS,parseSTL,weld,edgeTable,fixOrientation,analyze,load,orient,profile,decimate,chooseSpacing,prepare,bounds,normalizeOrientation,toBinarySTL,describeProblems,signedVolume};
})();
