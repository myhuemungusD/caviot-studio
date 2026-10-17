/* Conservative mesh repair. Never seal the sleeve cavity or bridge large openings. */
// Exact numeric re-implementation of the original string-keyed version: same welding, same face order, same
// filled faces and the same report, but with typed hash tables instead of millions of string keys.
window.MeshRepair=(()=>{
 // Open-addressing table keyed by three numbers compared exactly (-0 equals 0, as in the old string keys).
 function tripleTable(expected){
  let size=16;while(size<expected*2)size*=2;const mask=size-1,keys=new Float64Array(size*3),values=new Int32Array(size).fill(-1);
  const slot=(x,y,z)=>{let h=(Math.imul(x|0,73856093)^Math.imul(y|0,19349663)^Math.imul(z|0,83492791))&mask;for(;;){const v=values[h];if(v<0)return h;const k=h*3;if(keys[k]===x&&keys[k+1]===y&&keys[k+2]===z)return h;h=(h+1)&mask}};
  return{get(x,y,z){return values[slot(x,y,z)]},set(x,y,z,v){const h=slot(x,y,z),k=h*3;keys[k]=x;keys[k+1]=y;keys[k+2]=z;values[h]=v}};
 }
 // Numbers every undirected edge of a face list in first-seen order: ids[c] is the edge of corner c -> c+1 (within its
 // face). Buckets per lower vertex (CSR) keep this exact, ordered and cache friendly on million-face meshes.
 function edgeIds(out,n){
  const corners=out.length,start=new Int32Array(n+1),ids=new Int32Array(corners);
  for(let i=0;i<corners;i+=3)for(let j=0;j<3;j++){const a=out[i+j],b=out[i+(j+1)%3];start[(a<b?a:b)+1]++}
  for(let v=0;v<n;v++)start[v+1]+=start[v];
  const fill=new Int32Array(n),bucketHi=new Int32Array(corners),bucketId=new Int32Array(corners);let edges=0;
  for(let i=0;i<corners;i+=3)for(let j=0;j<3;j++){const a=out[i+j],b=out[i+(j+1)%3],lo=a<b?a:b,hi=a<b?b:a,s0=start[lo],end=s0+fill[lo];let e=-1;
   for(let k=s0;k<end;k++)if(bucketHi[k]===hi){e=bucketId[k];break}
   if(e<0){e=edges++;bucketHi[end]=hi;bucketId[end]=e;fill[lo]++}ids[i+j]=e}
  return{ids,count:edges};
 }
 const sort3=(a,b,c)=>{let t;if(a>b){t=a;a=b;b=t}if(b>c){t=b;b=c;c=t}if(a>b){t=a;a=b;b=t}return[a,b,c]};
 function repair(positions,indices,options={}){
  for(let i=0;i<positions.length;i++)if(!Number.isFinite(positions[i]))throw Error('Mesh contains non-finite coordinates.');
  // A mesh that is already closed is returned as is. Welding is only for broken meshes: on a closed mesh it can merge
  // distinct vertices that sit closer than the weld grid (fine contour cuts do) and open or pinch the surface.
  if(!options.alwaysWeld&&indices.length){const before=check(positions,indices);if(before.closed)return{positions:positions?.constructor?.name==='Float32Array'?positions:new Float32Array(positions),indices:indices?.constructor?.name==='Uint32Array'?indices:new Uint32Array(indices),report:{...before,welded:0,removed:0,filled:0,alreadyClosed:true}}}
  const count=positions.length/3,remap=new Uint32Array(count),p=new Float64Array(positions.length),weldTable=tripleTable(count);let n=0,welded=0,removed=0,filled=0;
  for(let i=0;i<count;i++){const x=Math.round(positions[i*3]*100000),y=Math.round(positions[i*3+1]*100000),z=Math.round(positions[i*3+2]*100000);let v=weldTable.get(x,y,z);if(v<0){v=n++;weldTable.set(x,y,z,v);p[v*3]=positions[i*3];p[v*3+1]=positions[i*3+1];p[v*3+2]=positions[i*3+2]}else welded++;remap[i]=v}
  const out=[],seen=tripleTable(indices.length/3+16);let faces=0;
  for(let i=0;i<indices.length;i+=3){
   for(let j=0;j<3;j++){const v=indices[i+j];if(!Number.isInteger(v)||v<0||v>=count)throw Error('Mesh contains invalid face indices.')}
   const a=remap[indices[i]],b=remap[indices[i+1]],c=remap[indices[i+2]];
   const u0=p[b*3]-p[a*3],u1=p[b*3+1]-p[a*3+1],u2=p[b*3+2]-p[a*3+2],v0=p[c*3]-p[a*3],v1=p[c*3+1]-p[a*3+1],v2=p[c*3+2]-p[a*3+2];
   const area=(u1*v2-u2*v1)**2+(u2*v0-u0*v2)**2+(u0*v1-u1*v0)**2;
   if(a===b||b===c||c===a||area<1e-18){removed++;continue}
   const [x,y,z]=sort3(a,b,c);if(seen.get(x,y,z)>=0){removed++;continue}seen.set(x,y,z,faces++);out.push(a,b,c);
  }
  const edges=edgeIds(out,n),ea=new Int32Array(edges.count),eb=new Int32Array(edges.count),ec=new Int32Array(edges.count);
  for(let i=0;i<out.length;i+=3)for(let j=0;j<3;j++){const e=edges.ids[i+j];if(ec[e]++===0){ea[e]=out[i+j];eb[e]=out[i+(j+1)%3]}}
  const outgoing=new Map(),incoming=new Map();for(let e=0;e<edges.count;e++)if(ec[e]===1){const a=ea[e],b=eb[e];if(!outgoing.has(a))outgoing.set(a,[]);outgoing.get(a).push(b);incoming.set(b,(incoming.get(b)||0)+1)}
  const used=new Set(),distance=(x,y)=>Math.hypot(p[x*3]-p[y*3],p[x*3+1]-p[y*3+1],p[x*3+2]-p[y*3+2]);
  for(const [a,bs]of outgoing){if(used.has(a)||bs.length!==1||incoming.get(a)!==1)continue;const b=bs[0],c=outgoing.get(b)?.[0];if(c===undefined||c===a||outgoing.get(b)?.length!==1||outgoing.get(c)?.length!==1||outgoing.get(c)[0]!==a||incoming.get(b)!==1||incoming.get(c)!==1)continue;if(Math.max(distance(a,b),distance(b,c),distance(c,a))>2)continue;const [x,y,z]=sort3(a,b,c);if(seen.get(x,y,z)>=0)continue;out.push(a,c,b);seen.set(x,y,z,faces++);used.add(a);used.add(b);used.add(c);filled++}
  const result={positions:new Float32Array(p.subarray(0,n*3)),indices:new Uint32Array(out)};
  result.report={...analyze(result.positions,result.indices,n),welded,removed,filled};return result;
 }
 // Closed-surface report for a face list: the export check (open, non-manifold and collapsed faces) plus winding
 // conflicts and non-manifold vertices.
 function analyze(positions,out,n){
  const validation=MeshCore.validateMesh(positions,out);
  // Consistent winding is necessary for a closed oriented surface. One pass gathers each edge's direction sum and
  // joins the corners that share an edge, so a vertex whose corners fall in several fans is non-manifold.
  const links=edgeIds(out,n),dirSum=new Int32Array(links.count),firstA=new Int32Array(links.count).fill(-1),firstB=new Int32Array(links.count),parents=new Uint32Array(out.length);for(let i=0;i<parents.length;i++)parents[i]=i;
  const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i]}return i},join=(a,b)=>{parents[root(a)]=root(b)};
  for(let i=0;i<out.length;i+=3)for(let j=0;j<3;j++){const ca=i+j,cb=i+(j+1)%3,a=out[ca],b=out[cb],s=links.ids[i+j];
   if(firstA[s]<0){dirSum[s]=a<b?1:-1;firstA[s]=ca;firstB[s]=cb}
   else{dirSum[s]+=a<b?1:-1;const pa=firstA[s],pb=firstB[s];join(ca,out[pa]===a?pa:pb);join(cb,out[pa]===b?pa:pb)}}
  const vertexRoot=new Int32Array(n).fill(-1),bad=new Uint8Array(n);let nonManifoldVertices=0;
  for(let i=0;i<out.length;i++){const v=out[i],r=root(i);if(vertexRoot[v]>=0&&vertexRoot[v]!==r){if(!bad[v]){bad[v]=1;nonManifoldVertices++}}else vertexRoot[v]=r}
  let winding=0;for(const sum of dirSum)if(Math.abs(sum)>1)winding++;
  return{...validation,winding,nonManifoldVertices,closed:out.length>0&&!validation.boundary&&!validation.nonManifold&&!validation.zeroArea&&!winding&&!nonManifoldVertices};
 }
 // Report on a mesh as it is, without changing it.
 function check(positions,indices){
  const n=positions.length/3;for(let i=0;i<indices.length;i++){const v=indices[i];if(!Number.isInteger(v)||v<0||v>=n)throw Error('Mesh contains invalid face indices.')}
  return analyze(positions,indices,n);
 }
 return{repair,check};
})();
