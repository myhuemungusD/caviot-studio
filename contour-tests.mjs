import assert from 'node:assert/strict';
await import('./dist/template-sharp.js');
const cols=257,rows=129,hm=new Float32Array(cols*rows);
for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)hm[y*cols+x]=y>=43&&y<=87?1:0;
const field=SharpSleeve.contourField({heightmap:hm,cols,rows,designWidth:60,designHeight:60});
// A straight outline must stay at pixel 42.5 even when mesh samples fall
// asymmetrically on either side. Alpha interpolation puts it at their midpoint.
let oldError=0,newError=0;
const sample=(f,y)=>{const a=Math.floor(y),t=y-a;return f[a*cols+128]*(1-t)+f[(a+1)*cols+128]*t};
for(let i=0;i<100;i++){
 const a=38+i/100*3,b=44+i/100*4;
 const crossing=f=>a+(b-a)*(.5-sample(f,a))/(sample(f,b)-sample(f,a));
 oldError+=Math.abs(crossing(hm)-42.5);newError+=Math.abs(crossing(field)-42.5);
}
assert(newError<oldError*.01);
assert(field.every((v,i)=>(v>.5)===(hm[i]>.5)));
const empty=SharpSleeve.contourField({heightmap:new Float32Array(25),cols:5,rows:5,designWidth:3,designHeight:20});assert(empty.every(v=>v<.5&&Number.isFinite(v)));
console.log({oldMeanErrorPixels:oldError/100,newMeanErrorPixels:newError/100,signPreserved:true});
// Curved edges under non-uniform scaling also retain their silhouette.
const size=129,circle=new Float32Array(size*size),radius=35;
for(let y=0;y<size;y++)for(let x=0;x<size;x++)circle[y*size+x]=Math.max(0,Math.min(1,radius+.5-Math.hypot(x-64,y-64)));
const curved=SharpSleeve.contourField({heightmap:circle,cols:size,rows:size,designWidth:36,designHeight:55});
const bilinear=(f,x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;return(f[iy*size+ix]*(1-tx)+f[iy*size+ix+1]*tx)*(1-ty)+(f[(iy+1)*size+ix]*(1-tx)+f[(iy+1)*size+ix+1]*tx)*ty};
let oldCurve=0,newCurve=0;
for(let j=0;j<360;j++){
 const a=j*Math.PI/180,c=Math.cos(a),s=Math.sin(a),r0=radius-3.2,r1=radius+1.7;
 const crossing=f=>{const v0=bilinear(f,64+c*r0,64+s*r0),v1=bilinear(f,64+c*r1,64+s*r1);return r0+(r1-r0)*(.5-v0)/(v1-v0)};
 oldCurve+=Math.abs(crossing(circle)-radius);newCurve+=Math.abs(crossing(curved)-radius);
}
assert(newCurve<oldCurve*.3);assert(curved.every((v,i)=>(v>.5)===(circle[i]>.5)));
console.log({oldCurveErrorPixels:oldCurve/360,newCurveErrorPixels:newCurve/360});
