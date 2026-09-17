import fs from 'node:fs';import zlib from 'node:zlib';import crypto from 'node:crypto';
import './dist/template-core.js';
const input=fs.readFileSync('dist/templates/ETSYFOLGER.stl');
const base=SleeveTemplate.parse(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength));
const hash=crypto.createHash('sha256').update(input).digest('hex');
for(const [name,spacing]of [['preview',1.1],['print',.5]]){
  console.time(name);const p=SleeveTemplate.prepare(base,spacing,message=>console.log(name+': '+message));
  const fields=['positions','normals','indices','distance','thickness','uv','outer'].map(name=>({name,type:name==='indices'?'uint32':name==='outer'?'uint8':'float32',length:p[name].length}));
  const meta={format:'icaviot-template-1',sourceSha256:hash,spacing,height:p.height,chart:{arc:Array.from(p.chart.arc),radii:Array.from(p.chart.radii),perimeter:p.chart.perimeter},fields};
  const head=Buffer.from(JSON.stringify(meta));let bytes=(head.length+7)&~3;for(const f of fields)bytes=(bytes+f.length*(f.type==='uint8'?1:4)+3)&~3;
  const out=Buffer.alloc(bytes);out.writeUInt32LE(head.length);head.copy(out,4);let offset=(head.length+7)&~3;
  for(const f of fields){const Type=f.type==='uint32'?Uint32Array:f.type==='uint8'?Uint8Array:Float32Array;const typed=new Type(p[f.name]);Buffer.from(typed.buffer).copy(out,offset);offset=(offset+typed.byteLength+3)&~3}
  fs.writeFileSync('dist/templates/ETSYFOLGER-'+name+'.mesh',zlib.gzipSync(out,{level:9}));console.timeEnd(name);console.log(name,{vertices:p.positions.length/3,triangles:p.indices.length/3,bytes,compressed:fs.statSync('dist/templates/ETSYFOLGER-'+name+'.mesh').size});
}
