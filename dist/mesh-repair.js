/* Conservative mesh repair. Never seal the sleeve cavity or bridge large openings. */
window.MeshRepair={repair(positions,indices){
  if(!positions.every(Number.isFinite))throw Error('Mesh contains non-finite coordinates.');
  const p=[],remap=new Uint32Array(positions.length/3),vertices=new Map();let welded=0,removed=0,filled=0;
  for(let i=0;i<remap.length;i++){const key=[0,1,2].map(k=>Math.round(positions[i*3+k]*100000)).join(',');let v=vertices.get(key);if(v===undefined){v=p.length/3;vertices.set(key,v);p.push(positions[i*3],positions[i*3+1],positions[i*3+2])}else welded++;remap[i]=v}
  const out=[],seen=new Set();
  for(let i=0;i<indices.length;i+=3){const ids=[indices[i],indices[i+1],indices[i+2]];if(ids.some(v=>!Number.isInteger(v)||v<0||v>=remap.length))throw Error('Mesh contains invalid face indices.');const [a,b,c]=ids.map(v=>remap[v]);const u=[0,1,2].map(k=>p[b*3+k]-p[a*3+k]),v=[0,1,2].map(k=>p[c*3+k]-p[a*3+k]);const area=(u[1]*v[2]-u[2]*v[1])**2+(u[2]*v[0]-u[0]*v[2])**2+(u[0]*v[1]-u[1]*v[0])**2;const key=[a,b,c].sort((x,y)=>x-y).join(',');if(a===b||b===c||c===a||area<1e-18||seen.has(key)){removed++;continue}seen.add(key);out.push(a,b,c)}
  const edges=new Map(),key=(a,b)=>a<b?a+','+b:b+','+a;
  for(let i=0;i<out.length;i+=3)for(let j=0;j<3;j++){const a=out[i+j],b=out[i+(j+1)%3],k=key(a,b);const e=edges.get(k);if(e)e.count++;else edges.set(k,{a,b,count:1})}
  const outgoing=new Map(),incoming=new Map();for(const e of edges.values())if(e.count===1){if(!outgoing.has(e.a))outgoing.set(e.a,[]);outgoing.get(e.a).push(e.b);incoming.set(e.b,(incoming.get(e.b)||0)+1)}
  const used=new Set();for(const [a,bs]of outgoing){if(used.has(a)||bs.length!==1||incoming.get(a)!==1)continue;const b=bs[0],c=outgoing.get(b)?.[0];if(c===undefined||c===a||outgoing.get(b)?.length!==1||outgoing.get(c)?.length!==1||outgoing.get(c)[0]!==a||incoming.get(b)!==1||incoming.get(c)!==1)continue;const distance=(x,y)=>Math.hypot(...[0,1,2].map(k=>p[x*3+k]-p[y*3+k]));if(Math.max(distance(a,b),distance(b,c),distance(c,a))>2)continue;const faceKey=[a,b,c].sort((x,y)=>x-y).join(',');if(seen.has(faceKey))continue;out.push(a,c,b);seen.add(faceKey);used.add(a);used.add(b);used.add(c);filled++}
  const result={positions:new Float32Array(p),indices:new Uint32Array(out)};
  const validation=MeshCore.validateMesh(result.positions,result.indices);
  // Consistent winding is necessary for a closed oriented surface.
  const directions=new Map();for(let i=0;i<out.length;i+=3)for(let j=0;j<3;j++){const a=out[i+j],b=out[i+(j+1)%3],k=key(a,b);directions.set(k,(directions.get(k)||0)+(a<b?1:-1))}
  const parents=Uint32Array.from({length:out.length},(_,i)=>i),first=new Map();
  const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i]}return i},join=(a,b)=>{parents[root(a)]=root(b)};
  for(let i=0;i<out.length;i+=3)for(let j=0;j<3;j++){const ca=i+j,cb=i+(j+1)%3,a=out[ca],b=out[cb],k=key(a,b),prior=first.get(k);if(prior){join(ca,out[prior[0]]===a?prior[0]:prior[1]);join(cb,out[prior[0]]===b?prior[0]:prior[1])}else first.set(k,[ca,cb])}
  const vertexRoots=new Map(),badVertices=new Set();for(let i=0;i<out.length;i++){const v=out[i],r=root(i);if(vertexRoots.has(v)&&vertexRoots.get(v)!==r)badVertices.add(v);else vertexRoots.set(v,r)}
  const nonManifoldVertices=badVertices.size;
  let winding=0;for(const sum of directions.values())if(Math.abs(sum)>1)winding++;
  result.report={...validation,welded,removed,filled,winding,nonManifoldVertices,closed:out.length>0&&!validation.boundary&&!validation.nonManifold&&!validation.zeroArea&&!winding&&!nonManifoldVertices};return result;
}};
