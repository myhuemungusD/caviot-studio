'use strict';
// Built-in bottom logo. The Foger Sleeve template always carries the DM diamond on its outside underside: 16 mm
// wide, carved 0.4 mm deep, centred on the deepest flat part of the underside so it stays clear of the rim fillet
// and the bottom hole. A deboss keeps the bottom flat on the print bed. It is part of the template, not a setting:
// there is no control for it, saved projects do not store it, and custom STL templates never get it.
const BOTTOM_LOGO={label:'DM diamond',src:'branding/dm-diamond-relief.png',
  // dm-diamond-relief.png is 1024 x 1003 with a 4 px margin; the loader crops to the ink, so this is the ink aspect.
  aspect:1003/1024};
const bottomDefaults=Object.freeze({logo:'dm',surface:'underside',width:16,height:+(16*BOTTOM_LOGO.aspect).toFixed(2),centerX:15.5,centerZ:1,depthMm:.4,relief:'carved'});
let bottomMask=null,bottomMaskLoad=null;
// Only the built-in template carries the logo. Exposed read-only so tests and the phone UI can check it.
const bottomBuiltinActive=()=>templateActive()&&!!templateBase&&templateBase===builtinTemplateBase;
const bottomBrand={...bottomDefaults,get enabled(){return bottomBuiltinActive()}};
// Older saved projects and undo history may carry bottom branding settings from when the logo was adjustable.
// They are accepted and ignored: the logo now comes from the template.
function restoreBottomBrand(){}
function viewBottomBrand(){if(!camera||!controls||!templateBase)return;setTemplateMove(false);if(gridHelper)gridHelper.visible=false;camera.up.set(0,0,1);controls.target.set(0,0,0);camera.position.set(0,-120,0);camera.lookAt(controls.target);controls.update();}
const bottomOriginalView=templateView;templateView=function(which){if(camera)camera.up.set(0,1,0);if(gridHelper)gridHelper.visible=true;bottomOriginalView(which);};
const bottomOriginalOptions=templateOptions;templateOptions=function(detail=768){const o=bottomOriginalOptions(detail);if(bottomBuiltinActive()){if(!bottomMask)throw Error('The bottom logo is still loading. Try again in a moment.');const b=bottomDefaults;o.designs.push({surface:b.surface,maxHeight:b.depthMm,negative:true,sharp:true,centerX:b.centerX,centerZ:b.centerZ,designWidth:b.width,designHeight:b.height,designRotation:0,designY:0,heightmap:bottomMask.hm,rows:bottomMask.rows,cols:bottomMask.cols});o.sharp=true;}return o;};
// The plain template is a finished product (it has the logo), so it can be exported without customer artwork.
const bottomOriginalHas=hasSleeveArtwork;hasSleeveArtwork=function(){return bottomOriginalHas()||bottomBuiltinActive();};
// Masks follow the loader rules the relief tests use: ink is anything darker than 180 on all channels, cropped to
// the ink plus 4 px and resampled to 1024 columns; 230 and lighter is background, 150 and darker full height.
function loadBottomLogo(){
  return bottomMaskLoad??=(async()=>{
    try{
      const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Could not load the bottom logo.'));i.src=BOTTOM_LOGO.src;});
      const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let x0=img.width,y0=img.height,x1=0,y1=0;
      for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){const i=(y*img.width+x)*4;if(Math.min(data[i],data[i+1],data[i+2])<180){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
      x0=Math.max(0,x0-4);y0=Math.max(0,y0-4);x1=Math.min(img.width-1,x1+4);y1=Math.min(img.height-1,y1+4);
      const cols=1024,rows=Math.round(cols*(y1-y0+1)/(x1-x0+1));canvas.width=cols;canvas.height=rows;ctx.imageSmoothingQuality='high';ctx.drawImage(img,x0,y0,x1-x0+1,y1-y0+1,0,0,cols,rows);
      const pixels=ctx.getImageData(0,0,cols,rows).data,hm=new Float32Array(cols*rows);for(let i=0;i<hm.length;i++)hm[i]=Math.max(0,Math.min(1,(230-Math.min(pixels[i*4],pixels[i*4+1],pixels[i*4+2]))/80));
      bottomMask={hm,cols,rows,logo:'dm'};if(bottomBuiltinActive())requestTemplatePreview();
      return bottomMask;
    }catch(error){bottomMaskLoad=null;templateStatus(error.message);return null;}
  })();
}
loadBottomLogo();
const bottomOriginalRequest=requestTemplatePreview;requestTemplatePreview=function(){if(bottomBuiltinActive()&&!bottomMask){templateStatus('Loading the bottom logo…');loadBottomLogo();return;}bottomOriginalRequest();};
function reportBottomPreview(data){if(!bottomBuiltinActive()||data.error)return;if(data.info?.affectedByDesign?.at(-1)===0)console.warn('Built-in bottom logo did not land on the underside.');}
