'use strict';
globalThis.ProjectFormat={
  decode(text){
    if(typeof text!=='string'||text.length>36*1024*1024)throw Error('Project is too large (36 MB maximum).');
    const p=JSON.parse(text);
    if(!p||p.format!=='icaviot-project'||![1,2].includes(p.version)||!p.settings||typeof p.settings!=='object'||Array.isArray(p.settings))throw Error('This is not a supported Caviot project.');
    if(p.image!==null&&(typeof p.image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(p.image)))throw Error('Project artwork must be an embedded PNG.');
    if(typeof p.name!=='string'||p.name.length>80||typeof p.source!=='string'||p.source.length>300)throw Error('Project name or source is invalid.');
    if(p.version===2){
      if(!Array.isArray(p.sides)||p.sides.length!==2||![0,1].includes(p.activeSide)||typeof p.linkSides!=='boolean')throw Error('Invalid front/back project.');
      const numbers={designAngle:[-180,180],designY:[0,89],designWidth:[2,160],designHeight:[2,89],designRotation:[-180,180],bgR:[0,255],bgG:[0,255],bgB:[0,255],bgTol:[0,180],smoothPasses:[0,3],letterSpacing:[-100,100],letterThickness:[-100,100]};
      const booleans=['bgEnable','bgSoft','mirror','invert'];
      for(const side of p.sides){
        if(!side||typeof side.source!=='string'||side.source.length>300||!side.settings||typeof side.settings!=='object'||Array.isArray(side.settings))throw Error('Invalid side settings.');
        if(side.image!==null&&(typeof side.image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(side.image)))throw Error('Side artwork must be an embedded PNG.');
        const cleaned={};for(const [key,range]of Object.entries(numbers)){const v=side.settings[key];if(typeof v!=='number'||!Number.isFinite(v)||v<range[0]||v>range[1])throw Error('Invalid side setting: '+key);cleaned[key]=v;}
        for(const key of booleans){if(typeof side.settings[key]!=='boolean')throw Error('Invalid side setting: '+key);cleaned[key]=side.settings[key];}side.settings=cleaned;
      }
    }
    if(p.bottomBrand!==undefined){const b=p.bottomBrand;if(!b||typeof b.enabled!=='boolean'||!['underside','inside'].includes(b.surface))throw Error('Invalid bottom branding.');for(const [k,lo,hi]of [['width',4,60],['height',4,36],['centerX',-32,32],['centerZ',-20,20]])if(typeof b[k]!=='number'||!Number.isFinite(b[k])||b[k]<lo||b[k]>hi)throw Error('Invalid bottom branding size or position.');p.bottomBrand={enabled:b.enabled,surface:b.surface,width:b.width,height:b.height,centerX:b.centerX,centerZ:b.centerZ};}
    return p;
  }
};
