'use strict';
/* Template file formats. STL goes straight to the template worker; OBJ and 3MF are converted
   here to a binary STL first, so the rest of the pipeline (limits, watertight checks, project
   embedding) is exactly the STL path. Unsupported files are refused with a plain message. */
globalThis.TemplateFormats=(()=>{
  const MAX_BYTES=100*1024*1024,MAX_TRIANGLES=2000000;
  const fail=(message,code='UNSUPPORTED')=>{const e=Error(message);e.code=code;return e};
  const SUPPORTED='STL, OBJ or 3MF';
  const extOf=name=>{const m=/\.([a-z0-9]+)$/i.exec(String(name||''));return m?m[1].toLowerCase():''};
  const asBytes=b=>b instanceof Uint8Array?b:ArrayBuffer.isView(b)?new Uint8Array(b.buffer,b.byteOffset,b.byteLength):new Uint8Array(b);
  const startsWith=(bytes,sig)=>sig.every((v,i)=>bytes[i]===v);
  function headText(bytes,n=2048){let s='';for(let i=0;i<Math.min(n,bytes.length);i++)s+=String.fromCharCode(bytes[i]);return s}

  // ---------- Detection by extension and content ----------
  function detect(buffer,name='',size){
    const bytes=asBytes(buffer),total=size||bytes.length,ext=extOf(name),head=headText(bytes);
    if(!bytes.length)throw fail('The file is empty.','EMPTY');
    if(startsWith(bytes,[0x89,0x50,0x4e,0x47])||startsWith(bytes,[0xff,0xd8,0xff])||/^GIF8|^RIFF....WEBP/.test(head)||/heic|heif/i.test(head.slice(4,12))||['png','jpg','jpeg','heic','heif','gif','webp'].includes(ext))
      throw fail('That is a picture, not a 3D sleeve. Add pictures with Add logo; templates must be '+SUPPORTED+'.');
    if(ext==='usdz'||ext==='usd'||ext==='usdc'||ext==='usda'||ext==='reality')
      throw fail('USDZ scans (iPhone Object Capture) cannot be read yet. Export the scan as STL or OBJ from your scanning app, then load that.');
    if(ext==='glb'||ext==='gltf'||ext==='ply'||ext==='fbx'||ext==='step'||ext==='stp'||ext==='blend'||ext==='dae')
      throw fail('.'+ext.toUpperCase()+' files are not supported as templates. Export the model as '+SUPPORTED+'.');
    const zip=startsWith(bytes,[0x50,0x4b,0x03,0x04]);
    if(zip){
      if(ext==='stl'||ext==='obj')throw fail('This file is named .'+ext+' but is really a ZIP archive. Unzip it or export the model again.','BAD_FORMAT');
      if(ext==='zip')throw fail('ZIP files are not supported. Unzip it and load the STL, OBJ or 3MF inside.');
      return '3mf';
    }
    if(ext==='3mf')throw fail('This 3MF file is damaged: it is not a ZIP package.','BAD_FORMAT');
    const binaryStl=bytes.length>=84&&(()=>{const n=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(80,true);return n>0&&84+n*50<=total&&total-(84+n*50)<512})();
    if(binaryStl)return 'stl';
    if(/^\s*solid\b/i.test(head)&&/\bfacet\b|\bendsolid\b/i.test(head))return 'stl';
    if(/^\s*(v|vn|vt|f|o|g|mtllib|usemtl|#)[ \t]/m.test(head)&&/^\s*v[ \t]+[-+.\d]/m.test(head)&&!/[\x00-\x08\x0e-\x1f]/.test(head))return 'obj';
    if(ext==='stl')return 'stl'; // let the STL parser explain exactly what is wrong
    if(ext==='obj')throw fail('This OBJ file has no vertex lines. Export the model again.','BAD_FORMAT');
    throw fail((ext?'.'+ext.toUpperCase()+' files are':'This file is')+' not a supported 3D template. Use '+SUPPORTED+'.');
  }

  // ---------- Common output ----------
  function soupToSTL(tris,count,header){
    if(!count)throw fail('The model contains no triangles.','EMPTY');
    if(count>MAX_TRIANGLES)throw fail('The model has '+count.toLocaleString()+' triangles; the limit is '+MAX_TRIANGLES.toLocaleString()+'. Decimate it first.','TOO_LARGE');
    const buf=new ArrayBuffer(84+count*50),view=new DataView(buf),b=new Uint8Array(buf);for(let i=0;i<Math.min(80,header.length);i++)b[i]=header.charCodeAt(i)&127;view.setUint32(80,count,true);
    for(let f=0;f<count;f++){const o=84+f*50;for(let k=0;k<9;k++)view.setFloat32(o+12+k*4,tris[f*9+k],true)}
    return buf;
  }
  function growable(){let a=new Float32Array(9*4096),n=0;return{push(x){if(n>=a.length){if(a.length>=MAX_TRIANGLES*9+9)throw fail('The model has more than '+MAX_TRIANGLES.toLocaleString()+' triangles. Decimate it first.','TOO_LARGE');const g=new Float32Array(a.length*2);g.set(a);a=g}a[n++]=x},get data(){return a},get length(){return n}}}

  // ---------- OBJ (vertices + faces; normals, UVs and materials are ignored) ----------
  function objToSTL(buffer){
    const text=new TextDecoder().decode(asBytes(buffer));const vx=[],out=growable();let faces=0;
    const lines=text.split(/\r?\n/);
    for(let li=0;li<lines.length;li++){
      let line=lines[li];while(line.endsWith('\\')&&li+1<lines.length)line=line.slice(0,-1)+' '+lines[++li];
      const t=line.trim();if(!t||t[0]==='#')continue;const parts=t.split(/\s+/);
      if(parts[0]==='v'){const x=+parts[1],y=+parts[2],z=+parts[3];if(![x,y,z].every(Number.isFinite))throw fail('The OBJ has an invalid vertex on line '+(li+1)+'.','BAD_COORDS');vx.push(x,y,z)}
      else if(parts[0]==='f'){
        const n=vx.length/3,idx=parts.slice(1).map(p=>{let i=parseInt(p.split('/')[0],10);if(!Number.isFinite(i)||i===0)throw fail('The OBJ has an invalid face on line '+(li+1)+'.','BAD_FORMAT');i=i<0?n+i:i-1;if(i<0||i>=n)throw fail('The OBJ face on line '+(li+1)+' points to a vertex that does not exist.','BAD_FORMAT');return i});
        for(let k=1;k+1<idx.length;k++){for(const v of [idx[0],idx[k],idx[k+1]])for(let a=0;a<3;a++)out.push(vx[v*3+a]);faces++}
      }
    }
    if(!vx.length)throw fail('The OBJ file has no vertices.','EMPTY');
    if(!faces)throw fail('The OBJ has points but no faces (it may be a point cloud). Export it as a mesh.','EMPTY');
    return soupToSTL(out.data,faces,'Caviot template from OBJ');
  }

  // ---------- 3MF (ZIP + XML; every object in the build, with transforms and units) ----------
  const UNIT_MM={micron:.001,millimeter:1,centimeter:10,inch:25.4,foot:304.8,meter:1000};
  const attr=(s,k)=>{const m=new RegExp('\\b'+k+'\\s*=\\s*"([^"]*)"').exec(s);return m?m[1]:null};
  const IDENT=[1,0,0,0,1,0,0,0,1,0,0,0];
  function parseMatrix(s){if(!s)return IDENT;const v=s.trim().split(/\s+/).map(Number);return v.length===12&&v.every(Number.isFinite)?v:IDENT}
  // 3MF matrices are row vectors: p' = p·M with M given as m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32.
  function mul(a,b){const r=new Array(12);for(let i=0;i<3;i++)for(let j=0;j<3;j++)r[i*3+j]=a[i*3]*b[j]+a[i*3+1]*b[3+j]+a[i*3+2]*b[6+j];for(let j=0;j<3;j++)r[9+j]=a[9]*b[j]+a[10]*b[3+j]+a[11]*b[6+j]+b[9+j];return r}
  function threeMfToSTL(buffer){
    const fflate=globalThis.fflate;if(!fflate?.unzipSync)throw fail('The 3MF reader did not load. Reload the page and try again.','BAD_FORMAT');
    let files;try{files=fflate.unzipSync(asBytes(buffer),{filter:f=>/\.model$/i.test(f.name)||/_rels\/\.rels$/i.test(f.name)})}catch(e){throw fail('This 3MF file is damaged and cannot be unzipped.','BAD_FORMAT')}
    const dec=new TextDecoder(),names=Object.keys(files).filter(n=>/\.model$/i.test(n));if(!names.length)throw fail('This 3MF package has no 3D model inside.','BAD_FORMAT');
    const rels=Object.keys(files).find(n=>/^_rels\/\.rels$/i.test(n));let root=null;
    if(rels){const m=/Target\s*=\s*"\/?([^"]+\.model)"/i.exec(dec.decode(files[rels]));if(m)root=names.find(n=>n.toLowerCase()===m[1].toLowerCase())}
    root=root||names.find(n=>/^3D\/3dmodel\.model$/i.test(n))||names[0];
    // Objects from every model part (production-extension parts are referenced by path).
    const objects=new Map();
    for(const n of names){const xml=dec.decode(files[n]);const modelTag=/<(?:\w+:)?model\b[^>]*>/.exec(xml);const u=(modelTag&&attr(modelTag[0],'unit'))||'millimeter';const scale=UNIT_MM[u]??1;
      const re=/<(?:\w+:)?object\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?object>/g;let m;
      while((m=re.exec(xml))){const id=attr(m[1],'id');const body=m[2];const o={mesh:null,components:[],scale};
        const mesh=/<(?:\w+:)?mesh\b[\s\S]*?<\/(?:\w+:)?mesh>/.exec(body);
        if(mesh){const v=[];const vr=/<(?:\w+:)?vertex\b([^>]*)\/?>/g;let q;while((q=vr.exec(mesh[0]))){const x=+attr(q[1],'x'),y=+attr(q[1],'y'),z=+attr(q[1],'z');if(![x,y,z].every(Number.isFinite))throw fail('The 3MF has an invalid vertex.','BAD_COORDS');v.push(x,y,z)}
          const t=[];const tr=/<(?:\w+:)?triangle\b([^>]*)\/?>/g;while((q=tr.exec(mesh[0]))){const a=+attr(q[1],'v1'),b=+attr(q[1],'v2'),c=+attr(q[1],'v3');if(![a,b,c].every(i=>Number.isInteger(i)&&i>=0&&i<v.length/3))throw fail('The 3MF has a triangle that points to a vertex that does not exist.','BAD_FORMAT');t.push(a,b,c)}
          o.mesh={v,t}}
        const cr=/<(?:\w+:)?component\b([^>]*)\/?>/g;let c;while((c=cr.exec(body))){const path=attr(c[1],'p:path')||attr(c[1],'path');o.components.push({id:attr(c[1],'objectid'),part:path?path.replace(/^\//,''):n,m:parseMatrix(attr(c[1],'transform'))})}
        objects.set(n+'#'+id,o)}}
    const out=growable();let faces=0;
    function emit(key,m,depth){if(depth>16)throw fail('The 3MF has components nested too deeply.','BAD_FORMAT');const o=objects.get(key);if(!o)return;
      if(o.mesh){const {v,t}=o.mesh,s=o.scale;for(let i=0;i<t.length;i+=3){for(let k=0;k<3;k++){const j=t[i+k]*3,x=v[j],y=v[j+1],z=v[j+2];out.push((x*m[0]+y*m[3]+z*m[6]+m[9])*s);out.push((x*m[1]+y*m[4]+z*m[7]+m[10])*s);out.push((x*m[2]+y*m[5]+z*m[8]+m[11])*s)}faces++;if(faces>MAX_TRIANGLES)throw fail('The model has more than '+MAX_TRIANGLES.toLocaleString()+' triangles. Decimate it first.','TOO_LARGE')}}
      for(const c of o.components)emit(c.part+'#'+c.id,mul(c.m,m),depth+1)}
    const rootXml=dec.decode(files[root]);const build=/<(?:\w+:)?build\b[^>]*>([\s\S]*?)<\/(?:\w+:)?build>/.exec(rootXml);
    const items=[];if(build){const ir=/<(?:\w+:)?item\b([^>]*)\/?>/g;let it;while((it=ir.exec(build[1]))){const path=attr(it[1],'p:path');items.push({key:(path?path.replace(/^\//,''):root)+'#'+attr(it[1],'objectid'),m:parseMatrix(attr(it[1],'transform'))})}}
    if(!items.length)for(const [k,o]of objects)if(k.startsWith(root+'#')&&o.mesh)items.push({key:k,m:IDENT});
    for(const it of items)emit(it.key,it.m,0);
    if(!faces)throw fail('This 3MF has no printable mesh.','EMPTY');
    return soupToSTL(out.data,faces,'Caviot template from 3MF');
  }

  // Returns {buffer (binary or ASCII STL), format, name}.
  function toSTL(buffer,name=''){
    const bytes=asBytes(buffer);if(bytes.byteLength>MAX_BYTES)throw fail('The file is larger than 100 MB. Simplify it in your mesh tool first.','TOO_LARGE');
    const format=detect(bytes,name),base=String(name||'').replace(/\.(stl|obj|3mf)$/i,'').slice(0,120)||'Custom template';
    if(format==='stl')return{buffer:bytes.buffer.byteLength===bytes.byteLength?bytes.buffer:new Uint8Array(bytes).buffer,format,name:base};
    return{buffer:format==='obj'?objToSTL(bytes):threeMfToSTL(bytes),format,name:base};
  }
  return{MAX_BYTES,detect,toSTL,objToSTL,threeMfToSTL,extOf,ACCEPT:'.stl,.obj,.3mf,model/stl,model/obj,model/3mf,application/sla,application/vnd.ms-pki.stl,application/vnd.ms-package.3dmanufacturing-3dmodel+xml'};
})();
if(typeof module!=='undefined')module.exports=globalThis.TemplateFormats;
