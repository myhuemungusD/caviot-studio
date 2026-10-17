self.window=self;
importScripts('mesh-core.js','mesh-repair.js');
self.onmessage=({data})=>{try{const result=MeshRepair.repair(data.positions,data.indices);postMessage(result,[result.positions.buffer,result.indices.buffer])}catch(e){postMessage({error:e.message})}};
