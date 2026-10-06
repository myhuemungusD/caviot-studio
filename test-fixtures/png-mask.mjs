// Minimal PNG reader (8-bit greyscale, grey+alpha, RGB or RGBA; non-interlaced) and the bottom-logo loader rules
// from dist/bottom-brand.js, so tests read the shipped logo asset exactly as the page does.
import fs from 'node:fs';import zlib from 'node:zlib';
export function readPNG(file){
  const b=fs.readFileSync(file);if(b.readUInt32BE(0)!==0x89504e47)throw Error('not a PNG');
  let o=8,w=0,h=0,type=0,depth=0,inter=0;const idat=[];
  while(o<b.length){const len=b.readUInt32BE(o),kind=b.toString('ascii',o+4,o+8),data=b.subarray(o+8,o+8+len);o+=12+len;
    if(kind==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);depth=data[8];type=data[9];inter=data[12]}else if(kind==='IDAT')idat.push(data);else if(kind==='IEND')break}
  const ch={0:1,4:2,2:3,6:4}[type];if(depth!==8||!ch||inter)throw Error('unsupported PNG: type '+type+' depth '+depth+(inter?' interlaced':''));
  const raw=zlib.inflateSync(Buffer.concat(idat)),stride=w*ch,px=new Uint8Array(w*h*ch);
  for(let y=0;y<h;y++){const f=raw[y*(stride+1)],src=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)),row=y*stride;
    for(let x=0;x<stride;x++){const a=x>=ch?px[row+x-ch]:0,up=y?px[row-stride+x]:0,c=x>=ch&&y?px[row-stride+x-ch]:0;let v=src[x];
      if(f===1)v+=a;else if(f===2)v+=up;else if(f===3)v+=(a+up)>>1;else if(f===4){const p=a+up-c,pa=Math.abs(p-a),pb=Math.abs(p-up),pc=Math.abs(p-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?up:c}
      px[row+x]=v&255}}
  // Per-pixel minimum over colour channels (alpha composited on white, as the canvas does for an opaque page).
  const min=new Uint8Array(w*h);for(let i=0;i<w*h;i++){const p=i*ch;let m=ch<3?px[p]:Math.min(px[p],px[p+1],px[p+2]);if(ch===2||ch===4){const al=px[p+ch-1]/255;m=Math.round(m*al+255*(1-al))}min[i]=m}
  return{width:w,height:h,min};
}
export function logoMask(file){
  const {width:W,height:H,min}=readPNG(file);let x0=W,y0=H,x1=0,y1=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(min[y*W+x]<180){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
  x0=Math.max(0,x0-4);y0=Math.max(0,y0-4);x1=Math.min(W-1,x1+4);y1=Math.min(H-1,y1+4);
  const cw=x1-x0+1,chh=y1-y0+1,cols=1024,rows=Math.round(cols*chh/cw),hm=new Float32Array(cols*rows);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){ // bilinear, pixel centres aligned like canvas drawImage
    const fx=Math.max(0,Math.min(cw-1,(x+.5)*cw/cols-.5)),fy=Math.max(0,Math.min(chh-1,(y+.5)*chh/rows-.5)),ax=Math.floor(fx),ay=Math.floor(fy),bx=Math.min(cw-1,ax+1),by=Math.min(chh-1,ay+1),tx=fx-ax,ty=fy-ay;
    const g=(xx,yy)=>min[(y0+yy)*W+x0+xx],v=(g(ax,ay)*(1-tx)+g(bx,ay)*tx)*(1-ty)+(g(ax,by)*(1-tx)+g(bx,by)*tx)*ty;
    hm[y*cols+x]=Math.max(0,Math.min(1,(230-v)/80))}
  return{hm,cols,rows};
}
