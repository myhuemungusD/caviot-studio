import fs from 'node:fs';import vm from 'node:vm';import zlib from 'node:zlib';
const c={window:{},console,TextDecoder};vm.createContext(c);for(const f of ['mesh-core.js','template-core.js','mesh-repair.js'])vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c);c.MeshCore=c.window.MeshCore;const b=zlib.gunzipSync(fs.readFileSync('dist/templates/ETSYFOLGER-print.mesh'));const p=vm.runInContext('SleeveTemplate',c).decode(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));const r=c.window.MeshRepair.repair(p.positions,p.indices);console.log(r.report);if(!r.report.closed)process.exitCode=1;

