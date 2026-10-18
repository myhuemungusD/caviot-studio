'use strict';
// Preview normals with hard creases. Plain vertex normals average across sharp rims and cavity edges, so large
// faces next to them get fan-shaped shading streaks (worst on phone GPUs and coarse custom templates). A vertex whose
// faces bend by more than CREASE_DEG gets one copy per smooth group. Vertices 0..n-1 keep their ids (copies are
// appended, src maps them back), so per-vertex data and picking stay valid. Preview only; exports never use this.
const CREASE_COS=Math.cos(40*Math.PI/180);
function creaseNormals(positions,indices){
 const n=positions.length/3,faces=indices.length/3,fn=new Float32Array(faces*3),fu=new Float32Array(faces*3),deg=new Uint32Array(n+1);
 for(let f=0;f<faces;f++){const a=indices[f*3]*3,b=indices[f*3+1]*3,c=indices[f*3+2]*3,ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2],x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx,l=Math.hypot(x,y,z)||1;
  fn[f*3]=x;fn[f*3+1]=y;fn[f*3+2]=z;fu[f*3]=x/l;fu[f*3+1]=y/l;fu[f*3+2]=z/l;deg[indices[f*3]+1]++;deg[indices[f*3+1]+1]++;deg[indices[f*3+2]+1]++}
 for(let v=0;v<n;v++)deg[v+1]+=deg[v];const fill=deg.slice(0,n),inc=new Uint32Array(faces*3);for(let k=0;k<faces*3;k++)inc[fill[indices[k]]++]=k;
 const normals=new Float32Array(positions.length),out=Uint32Array.from(indices),extraP=[],extraN=[],src=[];let next=n;
 for(let v=0;v<n;v++){const s=deg[v],e=deg[v+1];if(s===e)continue;let sx=0,sy=0,sz=0;for(let i=s;i<e;i++){const f=(inc[i]/3)|0;sx+=fn[f*3];sy+=fn[f*3+1];sz+=fn[f*3+2]}
  const l=Math.hypot(sx,sy,sz)||1,ax=sx/l,ay=sy/l,az=sz/l;let smooth=true;for(let i=s;i<e&&smooth;i++){const f=(inc[i]/3)|0;if(fu[f*3]*ax+fu[f*3+1]*ay+fu[f*3+2]*az<CREASE_COS)smooth=false}
  if(smooth){normals[v*3]=ax;normals[v*3+1]=ay;normals[v*3+2]=az;continue}
  // Each corner takes the faces within the crease angle of its own face; equal results share one vertex.
  const groups=[];for(let i=s;i<e;i++){const k=inc[i],f=(k/3)|0;let gx=0,gy=0,gz=0;for(let j=s;j<e;j++){const g=(inc[j]/3)|0;if(fu[f*3]*fu[g*3]+fu[f*3+1]*fu[g*3+1]+fu[f*3+2]*fu[g*3+2]>=CREASE_COS){gx+=fn[g*3];gy+=fn[g*3+1];gz+=fn[g*3+2]}}
   const gl=Math.hypot(gx,gy,gz)||1;gx/=gl;gy/=gl;gz/=gl;let id=-1;for(const q of groups)if(q[1]*gx+q[2]*gy+q[3]*gz>.9999){id=q[0];break}
   if(id<0){if(!groups.length){id=v;normals[v*3]=gx;normals[v*3+1]=gy;normals[v*3+2]=gz}else{id=next++;extraP.push(positions[v*3],positions[v*3+1],positions[v*3+2]);extraN.push(gx,gy,gz);src.push(v)}groups.push([id,gx,gy,gz])}
   out[k]=id}}
 const P=new Float32Array(next*3),N=new Float32Array(next*3);P.set(positions);P.set(extraP,positions.length);N.set(normals);N.set(extraN,positions.length);
 return{positions:P,normals:N,indices:out,source:i=>i<n?i:src[i-n],count:next};
}
function creasedGeometry(positions,indices){
 const c=creaseNormals(positions,indices),geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(c.positions,3));geo.setAttribute('normal',new THREE.BufferAttribute(c.normals,3));geo.setIndex(new THREE.BufferAttribute(c.indices,1));geo.userData.crease=c;return geo;
}
function createSharpGeometry(positions,indices,walls,amplitude){
 const wallSet=new Set(walls),cap=[];for(let f=0;f<indices.length/3;f++)if(!wallSet.has(f))cap.push(indices[f*3],indices[f*3+1],indices[f*3+2]);
 const c=creaseNormals(positions,cap),base=c.count;
 const p=new Float32Array((base+walls.length*3)*3),n=new Float32Array(p.length),out=Array.from(c.indices);p.set(c.positions);n.set(c.normals);let cursor=base;
 for(const f of walls){const ids=[indices[f*3],indices[f*3+1],indices[f*3+2]],a=new THREE.Vector3().fromArray(positions,ids[0]*3),b=new THREE.Vector3().fromArray(positions,ids[1]*3),cc=new THREE.Vector3().fromArray(positions,ids[2]*3),normal=b.sub(a).cross(cc.sub(a)).normalize();for(const id of ids){p.set(positions.subarray(id*3,id*3+3),cursor*3);n.set(normal.toArray(),cursor*3);out.push(cursor++)}}
 const geo=new THREE.BufferGeometry(),colors=new Float32Array(p.length);for(let i=0;i<p.length/3;i++){const color=i>=base?[.46,.30,.18]:amplitude[c.source(i)]?[1,.55,.22]:[.80,.78,.74];colors.set(color,i*3)}geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setAttribute('position',new THREE.BufferAttribute(p,3));geo.setAttribute('normal',new THREE.BufferAttribute(n,3));geo.setIndex(out);return geo;
}
