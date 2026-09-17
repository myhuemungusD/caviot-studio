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
   float odx=place_otherCenter.x-arcDistance;odx-=floor(odx/place_perimeter+0.5)*place_perimeter;float ody=placePosition.y-place_otherCenter.y;
   vec2 ouv=vec2(odx*place_otherRotation.x+ody*place_otherRotation.y,-odx*place_otherRotation.y+ody*place_otherRotation.x)/place_otherSize+0.5;
   float otherMask=texture2D(place_otherLogo,ouv).r*step(0.0,ouv.x)*step(ouv.x,1.0)*step(0.0,ouv.y)*step(ouv.y,1.0)*outsideWall*place_otherEnabled;
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
 if(typeof captureDesignSide==='function'){
  captureDesignSide();const other=designSides[1-activeDesignSide];placementUniforms.otherEnabled.value=other?.image?1:0;
  if(other?.image){const built=sideRaster(other,768);if(placementOtherMap!==built.hm){placementOtherMap=built.hm;const canvas=document.createElement('canvas');canvas.width=built.cols;canvas.height=built.rows;const context=canvas.getContext('2d'),pixels=context.createImageData(built.cols,built.rows);for(let i=0;i<built.hm.length;i++){const v=Math.round(Math.max(0,Math.min(1,built.hm[i]))*255);pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=v;pixels.data[i*4+3]=255}context.putImageData(pixels,0,0);placementOtherTexture.image=canvas;placementOtherTexture.needsUpdate=true;}
   placementUniforms.otherCenter.value.set(SleeveTemplate.arcAt(placementMesh.userData.chart,(other.designAngle||0)*Math.PI/180+Math.PI/2),other.designY);placementUniforms.otherSize.value.set(other.designWidth,other.designHeight);const r=other.designRotation*Math.PI/180;placementUniforms.otherRotation.value.set(Math.cos(r),Math.sin(r));
  }
 }
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
