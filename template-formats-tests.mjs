// Template formats: STL (binary + ASCII) pass through; OBJ and 3MF convert to a binary STL that the
// normal custom-template pipeline loads watertight; pictures, USDZ and junk are refused with a message.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const dist=new URL('./dist/',import.meta.url),require=createRequire(import.meta.url);
globalThis.self=globalThis;globalThis.window=globalThis;globalThis.fflate=require('./dist/vendor/fflate.min.js');
for(const f of ['mesh-core.js','template-core.js','mesh-repair.js','custom-template.js','template-formats.js'])vm.runInThisContext(fs.readFileSync(new URL(f,dist),'utf8'),{filename:f});
const {CustomTemplate,TemplateFormats,fflate}=globalThis;
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name)};
const V=[[0,0,0],[30,0,0],[30,20,0],[0,20,0],[0,0,60],[30,0,60],[30,20,60],[0,20,60]],Q=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
const tris=()=>{const t=[];for(const [a,b,c,d]of Q)t.push([V[a],V[b],V[c]],[V[a],V[c],V[d]]);return t};
const binarySTL=t=>{const b=Buffer.alloc(84+t.length*50);b.writeUInt32LE(t.length,80);t.forEach((x,f)=>x.flat().forEach((v,k)=>b.writeFloatLE(v,84+f*50+12+k*4)));return b};
const asciiSTL=t=>Buffer.from('solid x\n'+t.map(x=>'facet normal 0 0 0\nouter loop\n'+x.map(p=>'vertex '+p.join(' ')).join('\n')+'\nendloop\nendfacet').join('\n')+'\nendsolid x\n');
const objQuads=()=>Buffer.from('# box\no box\n'+V.map(p=>'v '+p.join(' ')).join('\n')+'\nvn 0 0 1\nvt 0 0\n'+Q.map(q=>'f '+q.map(i=>(i+1)+'/1/1').join(' ')).join('\n')+'\n');
const objNegative=()=>Buffer.from(V.map(p=>'v '+p.join(' ')).join('\r\n')+'\r\n'+Q.map(q=>'f '+q.map(i=>i-8).join(' ')).join('\r\n'));
const model=(unit,body)=>`<?xml version="1.0" encoding="UTF-8"?><model unit="${unit}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${body}</resources>`;
const meshXml=(id,scale=1)=>`<object id="${id}" type="model"><mesh><vertices>${V.map(p=>`<vertex x="${p[0]*scale}" y="${p[1]*scale}" z="${p[2]*scale}"/>`).join('')}</vertices><triangles>${Q.flatMap(([a,b,c,d])=>[`<triangle v1="${a}" v2="${b}" v3="${c}"/>`,`<triangle v1="${a}" v2="${c}" v3="${d}"/>`]).join('')}</triangles></mesh></object>`;
const zip3mf=xml=>Buffer.from(fflate.zipSync({'[Content_Types].xml':fflate.strToU8('<Types/>'),'_rels/.rels':fflate.strToU8('<Relationships><Relationship Target="/3D/3dmodel.model" Id="r0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),'3D/3dmodel.model':fflate.strToU8(xml)}));
const size=buf=>{const r=CustomTemplate.load(buf),b=CustomTemplate.bounds(r.source.positions);return{report:r.report,ext:[0,1,2].map(a=>+(b.max[a]-b.min[a]).toFixed(3))}};
const closed=r=>assert.equal(CustomTemplate.describeProblems(r).length,0,'watertight: '+CustomTemplate.describeProblems(r).join(', '));

test('binary and ASCII STL are detected and passed through unchanged',()=>{for(const [buf,name]of [[binarySTL(tris()),'a.stl'],[asciiSTL(tris()),'b.STL'],[binarySTL(tris()),'no-extension']]){const out=TemplateFormats.toSTL(buf,name);assert.equal(out.format,'stl');assert.equal(Buffer.compare(Buffer.from(out.buffer),buf),0);const s=size(out.buffer);closed(s.report);assert.deepEqual(s.ext,[30,20,60])}});
test('OBJ with quads, normals/UVs and slash indices converts to a watertight template',()=>{const out=TemplateFormats.toSTL(objQuads(),'Scan.obj');assert.equal(out.format,'obj');assert.equal(out.name,'Scan');const s=size(out.buffer);assert.equal(s.report.triangles,12);closed(s.report);assert.deepEqual(s.ext,[30,20,60])});
test('OBJ with negative indices, CRLF and no extension is detected by content',()=>{const out=TemplateFormats.toSTL(objNegative(),'shared-file');assert.equal(out.format,'obj');closed(size(out.buffer).report)});
test('3MF in centimetres with build transform converts in millimetres',()=>{const xml=model('centimeter',meshXml(1,.1))+'<build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 5 5 5"/></build></model>';const out=TemplateFormats.toSTL(zip3mf(xml),'Sleeve.3mf');assert.equal(out.format,'3mf');const s=size(out.buffer);closed(s.report);assert.deepEqual(s.ext,[30,20,60])});
test('3MF with a component assembly (rotated) keeps every part',()=>{const xml=model('millimeter',meshXml(1)+'<object id="2" type="model"><components><component objectid="1" transform="0 1 0 -1 0 0 0 0 1 0 0 0"/></components></object>')+'<build><item objectid="2"/></build></model>';const s=size(TemplateFormats.toSTL(zip3mf(xml),'asm.3mf').buffer);closed(s.report);assert.deepEqual(s.ext,[20,30,60])});
test('unsupported files are refused with a clear message',()=>{
  const cases=[[Buffer.from([0x89,0x50,0x4e,0x47,0,0,0,0]),'logo.png',/picture/],[Buffer.from([0xff,0xd8,0xff,0xe0,1,2]),'IMG_0001',/picture/],[zip3mf(model('millimeter','')+'</model>').fill(0,10,11),'scan.usdz',/USDZ/],[Buffer.from('glTF'),'m.glb',/GLB/],
    [Buffer.from('hello world, not a model'),'notes.txt',/not a supported 3D template/],[Buffer.from('PK\x03\x04junk'),'x.zip',/ZIP files/],[Buffer.from('PK\x03\x04junk'),'bad.3mf',/damaged/],[Buffer.from('<model/>'),'bad.3mf',/not a ZIP/],[Buffer.from('v 1 2 3\nv 4 5 6\n'),'pts.obj',/no faces/],[Buffer.from('v 1 2 3\nf 1 2 9\n'),'x.obj',/does not exist/],[Buffer.alloc(0),'e.stl',/empty/]];
  for(const [buf,name,re]of cases)assert.throws(()=>TemplateFormats.toSTL(buf,name),e=>re.test(e.message),name)});
test('3MF without a mesh and STL over the triangle limit are refused',()=>{assert.throws(()=>TemplateFormats.toSTL(zip3mf(model('millimeter','')+'<build/></model>'),'e.3mf'),/no printable mesh/);const h=Buffer.alloc(84);h.writeUInt32LE(2000001,80);assert.throws(()=>CustomTemplate.parseSTL(Buffer.concat([h,Buffer.alloc(2000001*50)])),/limit/)});
console.log(count+' template format tests passed');
