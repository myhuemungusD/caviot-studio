'use strict';
function createSharpGeometry(positions,indices,walls,amplitude){
 const wallSet=new Set(walls),cap=[];for(let f=0;f<indices.length/3;f++)if(!wallSet.has(f))cap.push(indices[f*3],indices[f*3+1],indices[f*3+2]);
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setIndex(cap);geo.computeVertexNormals();
 const p=new Float32Array(positions.length+walls.length*9),n=new Float32Array(p.length),out=Array.from(cap);p.set(positions);n.set(geo.getAttribute('normal').array);let cursor=positions.length/3;
 for(const f of walls){const ids=[indices[f*3],indices[f*3+1],indices[f*3+2]],a=new THREE.Vector3().fromArray(positions,ids[0]*3),b=new THREE.Vector3().fromArray(positions,ids[1]*3),c=new THREE.Vector3().fromArray(positions,ids[2]*3),normal=b.sub(a).cross(c.sub(a)).normalize();for(const id of ids){p.set(positions.subarray(id*3,id*3+3),cursor*3);n.set(normal.toArray(),cursor*3);out.push(cursor++)}}
 const colors=new Float32Array(p.length);for(let i=0;i<p.length/3;i++){const color=i>=positions.length/3?[.45,.20,.04]:amplitude[i]?[1,.36,.06]:[.72,.70,.66];colors.set(color,i*3)}geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setAttribute('position',new THREE.BufferAttribute(p,3));geo.setAttribute('normal',new THREE.BufferAttribute(n,3));geo.setIndex(out);return geo;
}
