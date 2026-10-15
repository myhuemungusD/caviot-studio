// The DM diamond is built into the Foger Sleeve template: 16 mm wide, carved 0.4 mm into the outside underside,
// clear of the rim fillet and the bottom hole, with strokes a 0.4 mm nozzle can print, and it exports closed.
import fs from 'node:fs';import zlib from 'node:zlib';import vm from 'node:vm';import assert from 'node:assert/strict';
import {logoMask} from './test-fixtures/png-mask.mjs';
globalThis.window=globalThis;
for(const f of ['mesh-core','template-core','template-sharp','project-format','bottom-fit'])await import('./dist/'+f+'.js');
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('ok',name)};

// Constants straight from the page script (everything above the first DOM access).
const src=fs.readFileSync('dist/bottom-brand.js','utf8');
const {BOTTOM_LOGO,bottomDefaults}=vm.runInNewContext(src.slice(0,src.indexOf('let bottomMask='))+';({BOTTOM_LOGO,bottomDefaults})');
// Measured spots on the Foger Sleeve (the inside one is only used to show the clearance check still works there).
const PLACES={underside:{centerX:15.5,centerZ:1},inside:{centerX:10.5,centerZ:1}};
const mask=logoMask('dist/branding/dm-diamond-relief.png');
const stl=fs.readFileSync('dist/templates/ETSYFOLGER.stl'),base=SleeveTemplate.parse(stl.buffer.slice(stl.byteOffset,stl.byteOffset+stl.byteLength));
const raw=zlib.gunzipSync(fs.readFileSync('dist/templates/ETSYFOLGER-print.mesh')),print=SleeveTemplate.decode(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const place=(o={})=>({...bottomDefaults,...o});
const design=b=>({surface:b.surface,maxHeight:b.depthMm,negative:b.relief==='carved',sharp:true,centerX:b.centerX,centerZ:b.centerZ,designWidth:b.width,designHeight:b.height,designRotation:0,designY:0,heightmap:mask.hm,rows:mask.rows,cols:mask.cols});

await test('defaults: DM logo, outside underside, 16 mm wide in its own proportions, 0.4 mm deboss, fixed',()=>{
  assert.deepEqual({...bottomDefaults},{logo:'dm',surface:'underside',width:16,height:15.67,centerX:15.5,centerZ:1,depthMm:.4,relief:'carved'});
  assert.ok(Object.isFrozen(bottomDefaults),'not adjustable');
  assert.equal(BOTTOM_LOGO.src,'branding/dm-diamond-relief.png');assert.ok(fs.existsSync('dist/'+BOTTOM_LOGO.src));
  assert.ok(Math.abs(bottomDefaults.height/bottomDefaults.width-mask.rows/mask.cols)<.002,'no stretching');
  assert.equal(PLACES.underside.centerX,bottomDefaults.centerX);assert.equal(PLACES.underside.centerZ,bottomDefaults.centerZ);
  assert.ok(/templateBase===builtinTemplateBase/.test(src),'only the built-in template gets the logo');
  assert.ok(!/bottomBrandPanel|innerHTML/.test(src)&&!/bottomBrandPanel/.test(fs.readFileSync('dist/index.html','utf8')),'no bottom branding controls');
});

await test('relief asset: high-contrast black on white, five continuous strokes, 0.4 mm nozzle sized at 16 mm',()=>{
  assert.equal(mask.cols,1024);assert.equal(mask.rows,1003);
  const n=mask.cols*mask.rows,ink=new Uint8Array(n);let mid=0;for(let i=0;i<n;i++){ink[i]=mask.hm[i]>.5;if(mask.hm[i]>.05&&mask.hm[i]<.95)mid++}
  assert.ok(mid/n<.03,'edges are anti-aliased only, not a soft photo');
  // Connected strokes (4-neighbour flood fill).
  const lab=new Int32Array(n);let comps=0;const sizes=[];
  for(let s=0;s<n;s++){if(!ink[s]||lab[s])continue;comps++;let size=0;const st=[s];lab[s]=comps;while(st.length){const k=st.pop();size++;const x=k%mask.cols;for(const j of [k-1,k+1,k-mask.cols,k+mask.cols]){if(j<0||j>=n||(j===k-1&&x===0)||(j===k+1&&x===mask.cols-1))continue;if(ink[j]&&!lab[j]){lab[j]=comps;st.push(j)}}}sizes.push(size)}
  assert.equal(comps,5,'D, M and the three frame pieces each stay one piece');assert.ok(Math.min(...sizes)>2000);
  // Stroke width: twice the distance to background at stroke centres; gaps: distance between different strokes.
  const inside=new Uint8Array(n),outside=new Uint8Array(n);for(let i=0;i<n;i++){inside[i]=ink[i];outside[i]=!ink[i]}
  const pxmm=mask.cols/16,dIn=BottomFit.distanceField(inside,mask.cols,mask.rows,1/pxmm);
  const ridge=[];for(let y=1;y<mask.rows-1;y++)for(let x=1;x<mask.cols-1;x++){const k=y*mask.cols+x,d=dIn[k];if(d>.1&&d>=dIn[k-1]&&d>=dIn[k+1]&&d>=dIn[k-mask.cols]&&d>=dIn[k+mask.cols])ridge.push(2*d)}
  ridge.sort((a,b)=>a-b);const med=ridge[ridge.length>>1],p10=ridge[Math.floor(ridge.length*.1)];
  assert.ok(med>=.6&&med<=.75,'stroke '+med.toFixed(2)+' mm');assert.ok(p10>=.55,'thin spots '+p10.toFixed(2)+' mm');
  let gap=Infinity;for(let c=1;c<=comps;c++){const own=new Uint8Array(n);for(let i=0;i<n;i++)own[i]=lab[i]!==c;const d=BottomFit.distanceField(own,mask.cols,mask.rows,1/pxmm);for(let i=0;i<n;i++)if(lab[i]&&lab[i]!==c)gap=Math.min(gap,d[i])}
  assert.ok(gap>=.45,'narrowest gap '+gap.toFixed(2)+' mm');
  console.log('   stroke median %s mm, p10 %s mm, narrowest gap %s mm at 16 mm',med.toFixed(2),p10.toFixed(2),gap.toFixed(2));
});

await test('placement: the default sits on the deepest flat part of the underside, well clear of the rim and the hole',()=>{
  for(const surface of ['underside','inside']){
    const region=BottomFit.region(base.positions,base.indices,surface),spot=BottomFit.best(region),p=PLACES[surface];
    const clear=BottomFit.logoClearance(region,mask,place({surface,...p}),1);
    assert.ok(Math.hypot(spot.x-p.centerX,spot.z-p.centerZ)<.75,surface+' default near the measured best spot');
    assert.ok(clear>=3,surface+' clearance '+clear.toFixed(2)+' mm (relief keep-out is 1.2 mm)');
    console.log('   %s: clear circle r=%s mm at (%s, %s); logo edge clearance %s mm',surface,spot.radius.toFixed(2),spot.x.toFixed(2),spot.z.toFixed(2),clear.toFixed(2));
  }
  // The old 21 mm triangle position overlapped the 1.2 mm keep-out a little; the DM default does not.
  const region=BottomFit.region(base.positions,base.indices,'underside');
  assert.ok(BottomFit.logoClearance(region,mask,place({width:30,height:29.4}),1)<1.2,'the check does catch an oversized logo');
});

for(const [label,spacing] of [['desktop',.14],['phone',.2]])await test('export ('+label+' contour spacing '+spacing+' mm): built-in deboss alone and with side designs is closed and carved 0.4 mm',()=>{
  const b=place();
  for(const designs of [[design(b)],[{heightmap:mask.hm,rows:mask.rows,cols:mask.cols,designWidth:20,designHeight:19.6,designY:45,designAngle:0,sharp:true},design(b)],[{heightmap:mask.hm,rows:mask.rows,cols:mask.cols,designWidth:20,designHeight:19.6,designY:45,designAngle:0,sharp:true,negative:true},design(b)]]){
    const r=SharpSleeve.buildAdaptive(print,{designs,maxHeight:.6,negative:false,sharp:true,sharpSpacing:spacing});
    const v=MeshCore.validateMesh(r.positions,r.indices);
    assert.equal(v.boundary,0);assert.equal(v.nonManifold,0);assert.equal(v.zeroArea,0);assert.ok(r.info.affectedByDesign.at(-1)>0,'logo formed');
    let minY=Infinity,x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity,floor=0;
    for(let i=0;i<r.positions.length;i+=3){const x=r.positions[i],y=r.positions[i+1],z=r.positions[i+2];minY=Math.min(minY,y);
      if(Math.abs(y-.4)<.03&&Math.abs(x-b.centerX)<=b.width/2+.1&&Math.abs(z-b.centerZ)<=b.height/2+.1){floor++;x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z)}}
    assert.ok(minY>-.01,'nothing below the bed: the bottom stays flat, got '+minY.toFixed(3));
    assert.ok(floor>100&&x1-x0>14&&z1-z0>13.5,'carved floor 0.4 mm up covers the logo: '+floor+' pts, '+(x1-x0).toFixed(2)+' x '+(z1-z0).toFixed(2)+' mm');
    assert.equal(r.info.sharp,true,'sharp (smooth-contour) path');assert.ok(r.info.spacing<=spacing+1e-9,'no budget fallback: spacing '+r.info.spacing);
    if(designs.length===1)console.log('   %s triangles, carved floor %s x %s mm',(r.indices.length/3).toLocaleString('en-US'),(x1-x0).toFixed(2),(z1-z0).toFixed(2));
  }
});

await test('emboss and the inside floor still form closed with the DM mask (relief engine unchanged)',()=>{
  for(const b of [place({relief:'raised'}),place({surface:'inside',relief:'raised',...PLACES.inside})]){
    const r=SharpSleeve.buildAdaptive(print,{designs:[design(b)],maxHeight:.4,negative:b.relief==='carved',sharp:true,sharpSpacing:.2});assert.equal(r.info.sharp,true,'sharp (smooth-contour) path');const v=MeshCore.validateMesh(r.positions,r.indices);
    assert.equal(v.boundary+v.nonManifold+v.zeroArea,0);assert.ok(r.info.affectedByDesign[0]>0);
  }
});

await test('custom templates: the fit finds the largest clear spot and sizes the logo to it',()=>{
  // A 40 x 30 mm box with a 12 mm hole left of centre: the logo must go right of the hole and shrink to fit.
  const pts=[],idx=[];const quad=(a,b,c,d)=>{idx.push(a,b,c,a,c,d)};
  const N=96;for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){pts.push(-20+40*i/N,0,-15+30*j/N)}
  const keep=[];for(let j=0;j<N;j++)for(let i=0;i<N;i++){const cx=-20+40*(i+.5)/N,cz=-15+30*(j+.5)/N;if(Math.hypot(cx+8,cz)<6)continue;const a=j*(N+1)+i;idx.push(a,a+1,a+N+2,a,a+N+2,a+N+1)}
  const region=BottomFit.region(Float32Array.from(pts),idx,'underside');assert.ok(region);
  const spot=BottomFit.best(region);assert.ok(spot.x>6&&spot.x<12,'right of the hole: '+spot.x.toFixed(2));assert.ok(spot.radius>10&&spot.radius<11.6,'radius '+spot.radius.toFixed(2));
  assert.equal(BottomFit.region(Float32Array.from(pts),idx,'inside'),null,'no upward faces: no inside floor');
  const reach=BottomFit.inkRadius(mask,mask.rows/mask.cols);assert.ok(reach>.45&&reach<.56,'diamond tips set the reach: '+reach.toFixed(3));
});

await test('projects: old bottom branding fields of any shape are accepted and dropped',()=>{
  const p={format:'icaviot-project',version:1,name:'DM',source:'',settings:{},image:null};
  const enc=s=>ProjectFormat.decode(JSON.stringify(s));
  for(const bottomBrand of [{...bottomDefaults,enabled:true},{enabled:true,logo:'mainline',surface:'inside',width:13,height:9.725,centerX:15.5,centerZ:7},{enabled:'yes',width:1e9},null])
    assert.equal(enc({...p,bottomBrand}).bottomBrand,undefined);
  assert.ok(/function restoreBottomBrand\(\)\{\}/.test(src),'restore ignores them');
});
console.log('dm-bottom-tests: '+passed+' passed');
