'use strict';
globalThis.SleeveTemplate=(()=>{
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=a=>{const n=Math.hypot(...a);return n>1e-12?a.map(x=>x/n):[0,0,0]};
  function parse(buffer){
    const view=new DataView(buffer);if(buffer.byteLength<84)throw Error('Invalid sleeve STL.');
    const count=view.getUint32(80,true);if(count*50+84!==buffer.byteLength||count>100000)throw Error('Unsupported sleeve STL.');
    const points=[],indices=[],weld=new Map();
    for(let f=0;f<count;f++)for(let v=0;v<3;v++){
      const p=[0,1,2].map(a=>view.getFloat32(84+f*50+12+v*12+a*4,true));
      if(!p.every(Number.isFinite))throw Error('Invalid STL coordinates.');
      const key=p.map(x=>Math.round(x*1e5)).join(',');if(!weld.has(key)){weld.set(key,points.length);points.push(p)}indices.push(weld.get(key));
    }
    const min=[0,1,2].map(a=>Math.min(...points.map(p=>p[a]))),max=[0,1,2].map(a=>Math.max(...points.map(p=>p[a])));
    // Rigidly orient the original Z-up sleeve for the Y-up studio; no scaling.
    const center=min.map((x,a)=>(x+max[a])/2),mid=(min[2]+max[2])/2;
    const section=[];for(let f=0;f<indices.length;f+=3)for(let e=0;e<3;e++){const a=points[indices[f+e]],b=points[indices[f+(e+1)%3]];if((a[2]<mid)!==(b[2]<mid)){const t=(mid-a[2])/(b[2]-a[2]);section.push([a[0]+t*(b[0]-a[0])-center[0],a[1]+t*(b[1]-a[1])-center[1]])}}
    let xx=0,xy=0,yy=0;for(const p of section){xx+=p[0]*p[0];xy+=p[0]*p[1];yy+=p[1]*p[1]}
    const angle=.5*Math.atan2(2*xy,xx-yy),c=Math.cos(angle),s=Math.sin(angle);
    const transformed=points.map(p=>{const x=p[0]-center[0],z=p[1]-center[1];return[c*x+s*z,p[2]-min[2],s*x-c*z]});
    const bboxMin=[0,1,2].map(a=>Math.min(...transformed.map(p=>p[a]))),bboxMax=[0,1,2].map(a=>Math.max(...transformed.map(p=>p[a])));
    return{points:transformed,positions:new Float32Array(transformed.flat()),indices,height:max[2]-min[2],bounds:{min:bboxMin,max:bboxMax},originalTransform:{center,cos:c,sin:s,minZ:min[2]}};
  }
  function profile(base){
    const segments=[],y=base.height/2;
    for(let f=0;f<base.indices.length;f+=3){const hits=[];for(let e=0;e<3;e++){const a=base.points[base.indices[f+e]],b=base.points[base.indices[f+(e+1)%3]];if((a[1]<y)!==(b[1]<y)){const t=(y-a[1])/(b[1]-a[1]);hits.push([a[0]+t*(b[0]-a[0]),a[2]+t*(b[2]-a[2])])}}if(hits.length===2)segments.push(hits)}
    const count=720,radii=new Float32Array(count);
    for(let i=0;i<count;i++){const t=i/count*Math.PI*2,dx=Math.cos(t),dz=Math.sin(t);for(const [a,b]of segments){const ex=b[0]-a[0],ez=b[1]-a[1],det=dx*ez-dz*ex;if(Math.abs(det)<1e-9)continue;const r=(a[0]*ez-a[1]*ex)/det,u=(a[0]*dz-a[1]*dx)/det;if(r>0&&u>=0&&u<=1)radii[i]=Math.max(radii[i],r)}}
    // Bridge openings in the coordinate chart only; never create geometry there.
    for(let i=0;i<count;i++)if(!radii[i]){let a=1,b=1;while(!radii[(i-a+count)%count]&&a<count)a++;while(!radii[(i+b)%count]&&b<count)b++;radii[i]=(radii[(i-a+count)%count]*b+radii[(i+b)%count]*a)/(a+b)}
    const arc=new Float32Array(count+1);for(let i=1;i<=count;i++){const a=(i-1)/count*Math.PI*2,b=i/count*Math.PI*2,ra=radii[i-1],rb=radii[i%count];arc[i]=arc[i-1]+Math.hypot(ra*Math.cos(a)-rb*Math.cos(b),ra*Math.sin(a)-rb*Math.sin(b))}
    return{arc,radii,perimeter:arc[count]};
  }
  function arcAt(chart,angle){const tau=Math.PI*2,t=((angle%tau)+tau)%tau/(tau)*(chart.arc.length-1),i=Math.floor(t);return chart.arc[i]+(chart.arc[i+1]-chart.arc[i])*(t-i)}
  function angleAt(chart,s){s=((s%chart.perimeter)+chart.perimeter)%chart.perimeter;let a=0,b=chart.arc.length-1;while(b-a>1){const m=(a+b)>>1;if(chart.arc[m]>s)b=m;else a=m}return(a+(s-chart.arc[a])/(chart.arc[b]-chart.arc[a]))/(chart.arc.length-1)*Math.PI*2}
  function bvh(points,faces,ids){
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const i of ids)for(const v of faces[i])for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],points[v][a]);hi[a]=Math.max(hi[a],points[v][a])}
    if(ids.length<=12)return{lo,hi,ids};let axis=0;for(let a=1;a<3;a++)if(hi[a]-lo[a]>hi[axis]-lo[axis])axis=a;
    ids.sort((i,j)=>faces[i].reduce((s,v)=>s+points[v][axis],0)-faces[j].reduce((s,v)=>s+points[v][axis],0));const half=ids.length>>1;return{lo,hi,left:bvh(points,faces,ids.slice(0,half)),right:bvh(points,faces,ids.slice(half))};
  }
  function rayThickness(root,points,faces,o,d){
    let nearest=Infinity;const visit=node=>{let lo=0,hi=nearest;for(let a=0;a<3;a++){if(Math.abs(d[a])<1e-12){if(o[a]<node.lo[a]-1e-7||o[a]>node.hi[a]+1e-7)return}else{let t1=(node.lo[a]-o[a])/d[a],t2=(node.hi[a]-o[a])/d[a];if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)return}}
      if(!node.ids){visit(node.left);visit(node.right);return}
      for(const id of node.ids){const f=faces[id],a=points[f[0]],e1=sub(points[f[1]],a),e2=sub(points[f[2]],a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)continue;const inv=1/det,s=sub(o,a),u=inv*dot(s,h);if(u< -1e-6||u>1+1e-6)continue;const q=cross(s,e1),v=inv*dot(d,q);if(v< -1e-6||u+v>1+1e-6)continue;const t=inv*dot(e2,q);if(t>.002&&t<nearest)nearest=t}
    };visit(root);return nearest;
  }
  function prepare(base,spacing=.65,onProgress=()=>{}){
    const points=base.points.map(p=>p.slice()),normals=points.map(()=>[0,0,0]),faces=[],exterior=[];
    for(let i=0;i<base.indices.length;i+=3){const f=base.indices.slice(i,i+3),p=f.map(i=>points[i]),n=unit(cross(sub(p[1],p[0]),sub(p[2],p[0]))),radial=unit([p.reduce((s,p)=>s+p[0],0),0,p.reduce((s,p)=>s+p[2],0)]),outer=(dot(n,radial)>.25&&Math.abs(n[1])<.78)||(Math.abs(n[1])>.95&&p.every(v=>v[1]<12));faces.push(f);exterior.push(outer);
      if(outer)for(let j=0;j<3;j++){const u=unit(sub(p[(j+1)%3],p[j])),v=unit(sub(p[(j+2)%3],p[j])),angle=Math.acos(Math.max(-1,Math.min(1,dot(u,v))));for(let a=0;a<3;a++)normals[f[j]][a]+=n[a]*angle}
    }
    const originalFaces=faces.map(f=>f.slice()),tree=bvh(points,originalFaces,originalFaces.map((_,i)=>i));
    for(let i=0;i<normals.length;i++)normals[i]=unit(normals[i]);
    let tris=faces,tags=exterior;
    const edgeKey=(a,b)=>a<b?a+','+b:b+','+a;
    for(let pass=0;pass<24;pass++){
      const split=new Map();for(let i=0;i<tris.length;i++)if(tags[i]){let longest=spacing,edge=-1;for(let e=0;e<3;e++){const a=tris[i][e],b=tris[i][(e+1)%3],length=Math.hypot(...sub(points[a],points[b]));if(length>longest){longest=length;edge=e}}if(edge<0)continue;const a=tris[i][edge],b=tris[i][(edge+1)%3],key=edgeKey(a,b);if(!split.has(key)){split.set(key,points.length);points.push(points[a].map((v,k)=>(v+points[b][k])/2));normals.push(unit(normals[a].map((v,k)=>v+normals[b][k])))}}
      if(!split.size)break;if(points.length>900000)throw Error('Template detail is too high.');
      const next=[],nextTags=[];for(let i=0;i<tris.length;i++){const[a,b,c]=tris[i],ab=split.get(edgeKey(a,b)),bc=split.get(edgeKey(b,c)),ca=split.get(edgeKey(c,a));let out;
        const bits=(ab!==undefined?1:0)+(bc!==undefined?2:0)+(ca!==undefined?4:0);
        switch(bits){case 0:out=[[a,b,c]];break;case 1:out=[[a,ab,c],[ab,b,c]];break;case 2:out=[[b,bc,a],[bc,c,a]];break;case 4:out=[[c,ca,b],[ca,a,b]];break;case 3:out=[[b,bc,ab],[a,ab,c],[ab,bc,c]];break;case 5:out=[[a,ab,ca],[ab,b,c],[ab,c,ca]];break;case 6:out=[[c,ca,bc],[a,b,ca],[b,bc,ca]];break;case 7:out=[[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]];break}
        for(const f of out){next.push(f);nextTags.push(tags[i])}
      }tris=next;tags=nextTags;onProgress('refine '+pass+': '+points.length+' vertices / '+tris.length+' faces');
    }
    onProgress('boundaries');const membership=new Uint8Array(points.length),neighbors=points.map(()=>[]);
    for(let i=0;i<tris.length;i++){const f=tris[i];for(let e=0;e<3;e++){membership[f[e]]|=tags[i]?1:2;if(tags[i]){const a=f[e],b=f[(e+1)%3],length=Math.hypot(...sub(points[a],points[b]));neighbors[a].push([b,length]);neighbors[b].push([a,length])}}}
    // Geodesic keep-out band protects the original rim and every cutout.
    const distance=new Float32Array(points.length).fill(1.2),queue=[];const push=(id,d)=>{queue.push([id,d]);let i=queue.length-1;while(i){const p=(i-1)>>1;if(queue[p][1]<=d)break;[queue[i],queue[p]]=[queue[p],queue[i]];i=p}};
    const pop=()=>{const top=queue[0],last=queue.pop();if(queue.length){queue[0]=last;let i=0;for(;;){let c=i*2+1;if(c>=queue.length)break;if(c+1<queue.length&&queue[c+1][1]<queue[c][1])c++;if(queue[i][1]<=queue[c][1])break;[queue[i],queue[c]]=[queue[c],queue[i]];i=c}}return top};
    for(let i=0;i<points.length;i++)if(membership[i]!==1){distance[i]=0;if(membership[i]===3)push(i,0)}
    while(queue.length){const[id,d]=pop();if(d>distance[id]+1e-6)continue;for(const[j,len]of neighbors[id])if(d+len<distance[j]){distance[j]=d+len;push(j,d+len)}}
    onProgress('thickness');const thickness=new Float32Array(points.length),chart=profile(base),uv=new Float32Array(points.length);
    for(let i=0;i<points.length;i++){uv[i]=arcAt(chart,Math.atan2(points[i][2],points[i][0]));if(membership[i]===1&&distance[i]>.001)thickness[i]=rayThickness(tree,base.points,originalFaces,points[i],normals[i].map(x=>-x))}
    return{positions:new Float32Array(points.flat()),normals:new Float32Array(normals.flat()),indices:tris.flat(),distance,thickness,uv,outer:Uint8Array.from(membership,x=>x&1),chart,height:base.height,spacing};
  }
  function sample(hm,rows,cols,u,v){if(u<0||u>1||v<0||v>1)return 0;const x=u*(cols-1),y=v*(rows-1),a=Math.floor(x),b=Math.floor(y),c=Math.min(a+1,cols-1),d=Math.min(b+1,rows-1),tx=x-a,ty=y-b;return (hm[b*cols+a]*(1-tx)+hm[b*cols+c]*tx)*(1-ty)+(hm[d*cols+a]*(1-tx)+hm[d*cols+c]*tx)*ty}
  function artworkPoint(p,i,d){
    const ny=p.normals[i*3+1],y=p.positions[i*3+1];
    if(d.surface){if(y>12||(d.surface==='inside'?ny<.95:ny>-.95))return null;return[(d.surface==='inside'?-1:1)*(p.positions[i*3]-(d.centerX||0)),p.positions[i*3+2]-(d.centerZ||0)];}
    if(Math.abs(ny)>.78)return null;
    let dx=arcAt(p.chart,(d.designAngle||0)*Math.PI/180+Math.PI/2)-p.uv[i];dx-=Math.round(dx/p.chart.perimeter)*p.chart.perimeter;
    return[dx,y-(d.designY??p.height/2)];
  }
  function build(prepared,options={}){
    const width=Math.max(2,Math.min(prepared.chart.perimeter,Number(options.designWidth)||30)),height=Math.max(2,Math.min(prepared.height,Number(options.designHeight)||30)),centerY=Number.isFinite(options.designY)?options.designY:prepared.height/2,angle=(Number(options.designAngle)||0)*Math.PI/180+Math.PI/2,centerS=arcAt(prepared.chart,angle),rotation=(Number(options.designRotation)||0)*Math.PI/180,c=Math.cos(rotation),s=Math.sin(rotation),depth=Math.max(0,Math.min(3,Number(options.maxHeight)||0)),hm=options.heightmap,rows=options.rows,cols=options.cols;
    const positions=new Float32Array(prepared.positions),amplitude=new Float32Array(prepared.distance.length);let maxSafe=3,affected=0,clipped=0,peak=0;
    const designs=(options.designs||[options]).filter(d=>d.heightmap).map(d=>{const r=(d.designRotation||0)*Math.PI/180;return {...d,centerS:arcAt(prepared.chart,(d.designAngle||0)*Math.PI/180+Math.PI/2),c:Math.cos(r),s:Math.sin(r)}});
    const affectedByDesign=designs.map(()=>0);
    if(designs.length)for(let i=0;i<amplitude.length;i++){
      if(!prepared.outer[i])continue;
      const wall=prepared.thickness[i],wallGuard=Number.isFinite(wall)?Math.max(0,Math.min(1,(wall-.8)/.8)):0,boundary=Math.min(1,prepared.distance[i]/1.2)*wallGuard;
      let value=0;
      for(let j=0;j<designs.length;j++){const d=designs[j];const xy=artworkPoint(prepared,i,d);if(!xy)continue;const [dx,dy]=xy;const x=dx*d.c+dy*d.s,y=-dx*d.s+dy*d.c,w=Math.max(2,Math.min(prepared.chart.perimeter,d.designWidth||30)),h=Math.max(2,Math.min(prepared.height,d.designHeight||30));
       const v=sample(d.heightmap,d.rows,d.cols,x/w+.5,.5-y/h)*Math.max(0,Math.min(1,(w/2-Math.abs(x))/.3,(h/2-Math.abs(y))/.3));value=Math.max(value,v);if(v*boundary>=.001)affectedByDesign[j]++;
      }
      if(value<.001)continue;
      if(boundary<.99)clipped++;
      const a=value*boundary;if(a<.001)continue;amplitude[i]=a;affected++;peak=Math.max(peak,a);
      if(Number.isFinite(wall))maxSafe=Math.min(maxSafe,Math.max(0,(wall-.8)/a));
    }
    if(options.negative&&depth>maxSafe+.001)throw Error('Deboss depth exceeds the wall allowance here. Use '+Math.max(0,Math.floor(maxSafe*100)/100).toFixed(2)+' mm or less, or move the design.');
    const sign=options.negative?-1:1;for(let i=0;i<amplitude.length;i++)if(amplitude[i])for(let a=0;a<3;a++)positions[i*3+a]+=prepared.normals[i*3+a]*depth*sign*amplitude[i];
    return{positions,indices:prepared.indices,amplitude,info:{affected,affectedByDesign,clipped,maxSafeDepth:maxSafe,peakDepth:peak*depth,spacing:prepared.spacing,perimeter:prepared.chart.perimeter}};
  }
  function decode(buffer){const view=new DataView(buffer),len=view.getUint32(0,true),meta=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,len)));if(meta.format!=='icaviot-template-1')throw Error('Invalid prepared template.');let offset=(4+len+3)&~3;const out={chart:meta.chart,height:meta.height,spacing:meta.spacing};for(const field of meta.fields){const Type=field.type==='uint32'?Uint32Array:field.type==='uint8'?Uint8Array:Float32Array;out[field.name]=new Type(buffer,offset,field.length);offset=(offset+field.length*Type.BYTES_PER_ELEMENT+3)&~3}return out}
  return{artworkPoint,parse,prepare,build,decode,profile,arcAt,angleAt,dot,sub,cross,unit};
})();
