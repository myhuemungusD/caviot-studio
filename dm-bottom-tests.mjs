// The DM diamond is the standard bottom logo: on by default, 16 mm wide, raised 0.4 mm on the ETSYFOLGER underside,
// clear of the rim fillet and the bottom hole, with strokes a 0.4 mm nozzle can print, and it exports closed.
import fs from 'node:fs';import zlib from 'node:zlib';import vm from 'node:vm';import assert from 'node:assert/strict';
import {logoMask} from './test-fixtures/png-mask.mjs';
globalThis.window=globalThis;
for(const f of ['mesh-core','template-core','template-sharp','project-format','bottom-fit'])await import('./dist/'+f+'.js');
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('ok',name)};

// Constants straight from the page script (everything above the first DOM access).
const src=fs.readFileSync('dist/bottom-brand.js','utf8');
const {BOTTOM_LOGOS,bottomDefaults}=vm.runInNewContext(src.slice(0,src.indexOf('let bottomBrand='))+';({BOTTOM_LOGOS,bottomDefaults})');
const mask=logoMask('dist/branding/dm-diamond-relief.png');
const stl=fs.readFileSync('dist/templates/ETSYFOLGER.stl'),base=SleeveTemplate.parse(stl.buffer.slice(stl.byteOffset,stl.byteOffset+stl.byteLength));
const raw=zlib.gunzipSync(fs.readFileSync('dist/templates/ETSYFOLGER-print.mesh')),print=SleeveTemplate.decode(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const place=(o={})=>({...bottomDefaults,...o});
const design=b=>({surface:b.surface,maxHeight:b.depthMm,negative:b.relief==='carved',sharp:true,centerX:b.centerX,centerZ:b.centerZ,designWidth:b.width,designHeight:b.height,designRotation:0,designY:0,heightmap:mask.hm,rows:mask.rows,cols:mask.cols});

await test('defaults: DM logo on, outside underside, 16 mm wide in its own proportions, 0.4 mm emboss',()=>{
  assert.deepEqual({...bottomDefaults},{enabled:true,logo:'dm',surface:'underside',width:16,height:15.67,centerX:15.5,centerZ:1,depthMm:.4,relief:'raised'});
  assert.equal(BOTTOM_LOGOS.dm.src,'branding/dm-diamond-relief.png');assert.ok(fs.existsSync('dist/'+BOTTOM_LOGOS.dm.thumb));assert.ok(fs.existsSync('dist/'+BOTTOM_LOGOS.mainline.src));
  assert.ok(Math.abs(bottomDefaults.height/bottomDefaults.width-mask.rows/mask.cols)<.002,'no stretching');
  assert.equal(BOTTOM_LOGOS.dm.places.underside.centerX,bottomDefaults.centerX);assert.equal(BOTTOM_LOGOS.dm.places.underside.centerZ,bottomDefaults.centerZ);
  assert.ok(fs.readFileSync('dist/index.html','utf8').indexOf('bottom-fit.js')<fs.readFileSync('dist/index.html','utf8').indexOf('bottom-brand.js'));
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
    const region=BottomFit.region(base.positions,base.indices,surface),spot=BottomFit.best(region),p=BOTTOM_LOGOS.dm.places[surface];
    const clear=BottomFit.logoClearance(region,mask,place({surface,...p}),1);
    assert.ok(Math.hypot(spot.x-p.centerX,spot.z-p.centerZ)<.75,surface+' default near the measured best spot');
    assert.ok(clear>=3,surface+' clearance '+clear.toFixed(2)+' mm (relief keep-out is 1.2 mm)');
    console.log('   %s: clear circle r=%s mm at (%s, %s); logo edge clearance %s mm',surface,spot.radius.toFixed(2),spot.x.toFixed(2),spot.z.toFixed(2),clear.toFixed(2));
  }
  // The old 21 mm triangle position overlapped the 1.2 mm keep-out a little; the DM default does not.
  const region=BottomFit.region(base.positions,base.indices,'underside');
  assert.ok(BottomFit.logoClearance(region,mask,place({width:30,height:29.4}),1)<1.2,'the check does catch an oversized logo');
});

for(const [label,spacing] of [['desktop',.14],['phone',.2]])await test('export ('+label+' contour spacing '+spacing+' mm): default logo alone and with side designs is closed and raised 0.4 mm',()=>{
  const b=place();
  for(const designs of [[design(b)],[{heightmap:mask.hm,rows:mask.rows,cols:mask.cols,designWidth:20,designHeight:19.6,designY:45,designAngle:0,sharp:true},design(b)]]){
    const r=SharpSleeve.buildAdaptive(print,{designs,maxHeight:.6,negative:false,sharp:true,sharpSpacing:spacing});
    const v=MeshCore.validateMesh(r.positions,r.indices);
    assert.equal(v.boundary,0);assert.equal(v.nonManifold,0);assert.equal(v.zeroArea,0);assert.ok(r.info.affectedByDesign.at(-1)>0,'logo formed');
    let minY=Infinity,x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
    for(let i=0;i<r.positions.length;i+=3){const y=r.positions[i+1];minY=Math.min(minY,y);if(y<-.2){x0=Math.min(x0,r.positions[i]);x1=Math.max(x1,r.positions[i]);z0=Math.min(z0,r.positions[i+2]);z1=Math.max(z1,r.positions[i+2])}}
    assert.ok(Math.abs(minY+.4)<.02,'raised 0.4 mm below the underside, got '+minY.toFixed(3));
    // Raised strokes stay inside the logo box (the box includes the 4 px margin, about 0.06 mm).
    assert.ok(x0>=b.centerX-b.width/2-.1&&x1<=b.centerX+b.width/2+.1&&z0>=b.centerZ-b.height/2-.1&&z1<=b.centerZ+b.height/2+.1,'footprint '+[x0,x1,z0,z1].map(n=>n.toFixed(2)));
    assert.ok(x1-x0>15.4&&z1-z0>14.9,'the whole logo formed: '+(x1-x0).toFixed(2)+' x '+(z1-z0).toFixed(2)+' mm');
    assert.equal(r.info.sharp,true,'sharp (smooth-contour) path');assert.ok(r.info.spacing<=spacing+1e-9,'no budget fallback: spacing '+r.info.spacing);
    if(designs.length===1){
      // Raised top faces (all corners at least 0.3 mm proud) form exactly the five strokes: nothing broke apart.
      const parent=new Int32Array(r.positions.length/3).map((_,i)=>i),find=i=>{while(parent[i]!==i)i=parent[i]=parent[parent[i]];return i};let tops=0;
      for(let f=0;f<r.indices.length;f+=3){const a=r.indices[f],b=r.indices[f+1],c=r.indices[f+2];if(Math.max(r.positions[a*3+1],r.positions[b*3+1],r.positions[c*3+1])>-.3)continue;tops++;parent[find(b)]=find(a);parent[find(c)]=find(a)}
      const roots=new Set();for(let f=0;f<r.indices.length;f+=3){const a=r.indices[f],b=r.indices[f+1],c=r.indices[f+2];if(Math.max(r.positions[a*3+1],r.positions[b*3+1],r.positions[c*3+1])<=-.3)roots.add(find(a))}
      assert.equal(roots.size,5,'raised strokes: '+roots.size+' pieces from '+tops+' top faces');
    }
    if(designs.length===1)console.log('   %s triangles, raised footprint %s x %s mm, lowest point %s mm',(r.indices.length/3).toLocaleString('en-US'),(x1-x0).toFixed(2),(z1-z0).toFixed(2),minY.toFixed(3));
  }
});

await test('deboss and the inside floor still work with the DM logo',()=>{
  for(const b of [place({relief:'carved'}),place({surface:'inside',...BOTTOM_LOGOS.dm.places.inside})]){
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

await test('projects: the logo is saved and validated; older files keep what they had',()=>{
  const p={format:'icaviot-project',version:4,name:'DM',source:'',settings:{},image:null,layers:[[],[]],selectedIds:[null,null],template:null,bottomBrand:{...bottomDefaults}};
  const enc=s=>ProjectFormat.decode(JSON.stringify(s));
  try{assert.equal(enc(p).bottomBrand.logo,'dm')}catch(e){if(!/layers|Invalid project/.test(e.message))throw e;p.version=1;delete p.layers;delete p.selectedIds;delete p.template;assert.equal(enc(p).bottomBrand.logo,'dm')}
  assert.equal(enc({...p,bottomBrand:{...bottomDefaults,logo:'mainline'}}).bottomBrand.logo,'mainline');
  assert.throws(()=>enc({...p,bottomBrand:{...bottomDefaults,logo:'other'}}),/bottom logo/);
  const old={...bottomDefaults};delete old.logo;assert.equal(enc({...p,bottomBrand:old}).bottomBrand.logo,undefined,'no logo field: the page treats an enabled one as the triangle');
  assert.ok(/saved===undefined\)saved=\{enabled:false\}/.test(src)&&/logo:saved\.logo\|\|\(saved\.enabled\?'mainline'/.test(src),'restore rules in the page');
});
console.log('dm-bottom-tests: '+passed+' passed');
