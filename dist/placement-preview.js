'use strict';
// Placement uses the original 7,118-face sleeve. Export never uses this overlay.
let placementMesh=null,placementTexture=null,placementImageMap=null,placementTimer=null,placementFrame=null,placementPointer=null;
let placementOtherTexture=null,placementOtherMap=null;
const placementUniforms={otherLogo:{value:null},otherEnabled:{value:0},otherCenter:{value:new THREE.Vector2()},otherSize:{value:new THREE.Vector2(30,30)},otherRotation:{value:new THREE.Vector2(1,0)},logo:{value:null},arc:{value:null},perimeter:{value:1},center:{value:new THREE.Vector2()},size:{value:new THREE.Vector2(30,30)},rotation:{value:new THREE.Vector2(1,0)}};
function ensurePlacementMesh(){
 if(placementMesh||!templateBase||!scene)return;
 const chart=SleeveTemplate.profile(templateBase),pixels=new Uint8Array(chart.arc.length*4);
 for(let i=0;i<chart.arc.length;i++){const n=Math.round(chart.arc[i]/chart.perimeter*65535);pixels[i*4]=n>>8;pixels[i*4+1]=n&255;pixels[i*4+3]=255}
 const arc=new THREE.DataTexture(pixels,chart.arc.length,1,THREE.RGBAFormat);arc.minFilter=arc.magFilter=THREE.LinearFilter;arc.generateMipmaps=false;arc.needsUpdate=true;placementUniforms.arc.value=arc;placementUniforms.perimeter.value=chart.perimeter;
 placementTexture=new THREE.CanvasTexture(els.heightmapCanvas);placementTexture.minFilter=placementTexture.magFilter=THREE.LinearFilter;placementTexture.generateMipmaps=false;placementUniforms.logo.value=placementTexture;
 placementOtherTexture=new THREE.CanvasTexture(document.createElement('canvas'));placementOtherTexture.minFilter=placementOtherTexture.magFilter=THREE.LinearFilter;placementOtherTexture.generateMipmaps=false;placementUniforms.otherLogo.value=placementOtherTexture;
 const material=new THREE.MeshStandardMaterial({color:0xd2cec5,roughness:.48,metalness:.08,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  for(const [name,value]of Object.entries(placementUniforms))shader.uniforms['place_'+name]=value;
  shader.vertexShader='varying vec3 placePosition; varying vec3 placeNormal;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nplacePosition=position; placeNormal=normal;');
  shader.fragmentShader='varying vec3 placePosition; varying vec3 placeNormal; uniform sampler2D place_otherLogo; uniform float place_otherEnabled; uniform vec2 place_otherCenter; uniform vec2 place_otherSize; uniform vec2 place_otherRotation; uniform sampler2D place_logo; uniform sampler2D place_arc; uniform float place_perimeter; uniform vec2 place_center; uniform vec2 place_size; uniform vec2 place_rotation;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float turn=mod(atan(placePosition.z,placePosition.x)+6.28318530718,6.28318530718)/6.28318530718;
   vec2 encoded=texture2D(place_arc,vec2((turn*720.0+0.5)/721.0,0.5)).rg;
   float arcDistance=(encoded.r*65280.0+encoded.g*255.0)/65535.0*place_perimeter;
   float dx=place_center.x-arcDistance; dx-=floor(dx/place_perimeter+0.5)*place_perimeter;
   float dy=placePosition.y-place_center.y;
   vec2 local=vec2(dx*place_rotation.x+dy*place_rotation.y,-dx*place_rotation.y+dy*place_rotation.x);
   vec2 uv=local/place_size+0.5;
   float outsideWall=step(0.25,dot(normalize(placeNormal),normalize(vec3(placePosition.x,0.0,placePosition.z))))*(1.0-step(0.78,abs(normalize(placeNormal).y)));
   float inBounds=step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
   float mask=texture2D(place_logo,uv).r*inBounds*outsideWall;
   vec2 ouv=vec2(arcDistance/place_perimeter,placePosition.y/place_otherSize.y);
   float otherMask=texture2D(place_otherLogo,ouv).r*outsideWall*place_otherEnabled;
   mask=max(mask,otherMask);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.0,0.36,0.06),smoothstep(0.45,0.55,mask));`);
 };
 placementMesh=new THREE.Mesh(MC.toThreeGeometry(templateBase,THREE),material);placementMesh.userData.chart=chart;placementMesh.visible=false;scene.add(placementMesh);
}
function hidePlacementPreview(){clearTimeout(placementTimer);placementTimer=null;if(placementMesh)placementMesh.visible=false;if(meshObj)meshObj.visible=true;const repair=document.getElementById('makeWatertight');if(repair)repair.disabled=false;}
function showPlacementPreview(){
 ensurePlacementMesh();if(!placementMesh||!AppState.heightmap)return;
 if(placementImageMap!==AppState.heightmap){placementImageMap=AppState.heightmap;placementTexture.needsUpdate=true;}
 placementUniforms.center.value.set(SleeveTemplate.arcAt(placementMesh.userData.chart,(AppState.designAngle||0)*Math.PI/180+Math.PI/2),AppState.designY);
 placementUniforms.size.value.set(AppState.designWidth,AppState.designHeight);const angle=AppState.designRotation*Math.PI/180;placementUniforms.rotation.value.set(Math.cos(angle),Math.sin(angle));
 if(typeof captureDesignSide==='function'){captureDesignSide();updateOtherLayerAtlas();}
 const repair=document.getElementById('makeWatertight');if(repair)repair.disabled=true;placementMesh.visible=true;if(meshObj)meshObj.visible=false;
}
function finishPlacement(){
 clearTimeout(placementTimer);placementTimer=null;
 if(!templateActive()||!AppState.image){hidePlacementPreview();return}
 saveSettings();requestTemplatePreview();
}
function updatePlacement(){
 if(!templateActive()||!AppState.image){if(templateActive())renderTemplateBlank();return}
 clearTimeout(AppState.rebuildTimer);AppState.rebuildTimer=null;document.body.classList.remove('is-rebuilding');
 ++templateRevision;templatePending=null;
 // An obsolete detailed build must not consume CPU or replace the moving artwork.
 if(templatePreviewRunning&&templatePreviewWorker){templatePreviewWorker.terminate();templatePreviewWorker=null;templatePreviewRunning=false}
 showPlacementPreview();templateStatus('Positioning preview · detailed relief updates when you pause.');
 clearTimeout(placementTimer);placementTimer=setTimeout(finishPlacement,500);
}
function queuePlacementPointer(e){placementPointer={clientX:e.clientX,clientY:e.clientY};if(placementFrame!==null)return;placementFrame=requestAnimationFrame(()=>{placementFrame=null;const point=placementPointer;placementPointer=null;if(point&&templateActivePointer!==null)placeFromPointer(point)})}
function flushPlacementPointer(){if(placementFrame!==null)cancelAnimationFrame(placementFrame);placementFrame=null;const point=placementPointer;placementPointer=null;if(point)placeFromPointer(point);finishPlacement()}

let placementAtlasEntries=[],placementAtlasKey='';
function updateOtherLayerAtlas(){
 const layers=designLayers.flat().filter(s=>s.image&&s!==designSides[activeDesignSide]);
 const entries=layers.map(slot=>({slot,built:sideRaster(slot,512),cache:slot.cache}));
 const key=JSON.stringify(layers.map(s=>[s.id,s.designAngle,s.designY,s.designWidth,s.designHeight,s.designRotation]));
 placementUniforms.otherEnabled.value=layers.length?1:0;placementUniforms.otherSize.value.set(placementMesh.userData.chart.perimeter,templateBase.height);
 if(key===placementAtlasKey&&entries.length===placementAtlasEntries.length&&entries.every((e,i)=>e.cache===placementAtlasEntries[i].cache))return;
 placementAtlasEntries=entries;placementAtlasKey=key;
 const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;const ctx=canvas.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,canvas.width,canvas.height);const chart=placementMesh.userData.chart;
 ctx.scale(canvas.width/chart.perimeter,canvas.height/templateBase.height);
 for(const {slot,built}of entries){if(!slot.cache.atlasCanvas){const c=document.createElement('canvas');c.width=built.cols;c.height=built.rows;const context=c.getContext('2d'),pixels=context.createImageData(c.width,c.height);for(let i=0;i<built.hm.length;i++){pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=255;pixels.data[i*4+3]=Math.round(Math.max(0,Math.min(1,built.hm[i]))*255);}context.putImageData(pixels,0,0);slot.cache.atlasCanvas=c;}
  const center=SleeveTemplate.arcAt(chart,(slot.designAngle||0)*Math.PI/180+Math.PI/2);for(const shift of [-chart.perimeter,0,chart.perimeter]){ctx.save();ctx.translate(center+shift,templateBase.height-slot.designY);ctx.rotate(slot.designRotation*Math.PI/180);ctx.scale(-1,1);ctx.drawImage(slot.cache.atlasCanvas,-slot.designWidth/2,-slot.designHeight/2,slot.designWidth,slot.designHeight);ctx.restore();}
 }
 placementOtherTexture.image=canvas;placementOtherTexture.needsUpdate=true;
}
