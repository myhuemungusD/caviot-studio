// Writes dist/sw.js: the offline service worker with a content hash for every file in dist/.
// Run `node build-sw.mjs` after changing anything in dist/ (a node test fails while sw.js is out of date).
// Each worker version only ever serves the exact bytes listed here, so an update can never mix old and new files.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const dist=fileURLToPath(new URL('./dist/',import.meta.url));
// Fetched on first use instead of at install: the 120 fonts and the 17 MB print surface (first export).
// Blockletter is the default lettering font, so it is precached with the app.
const onDemand=p=>(/^fonts\/.+\.(ttf|otf|woff2?)$/i.test(p)&&!/^fonts\/Blockletter-/.test(p))||p==='templates/ETSYFOLGER-print.mesh';
const skip=p=>p==='sw.js'||/(^|\/)\./.test(p)||/LICENSE/i.test(p);
export function manifest(){
  const files={};
  const walk=dir=>{for(const name of fs.readdirSync(path.join(dist,dir)).sort()){const rel=dir?dir+'/'+name:name;const full=path.join(dist,rel);if(fs.statSync(full).isDirectory())walk(rel);else if(!skip(rel))files[rel]=crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex').slice(0,16);}};
  walk('');
  const version=crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,12);
  return {version,files,precache:Object.keys(files).filter(p=>!onDemand(p))};
}
export function render(){
  const {version,files,precache}=manifest();
  const template=fs.readFileSync(fileURLToPath(new URL('./sw-template.js',import.meta.url)),'utf8');
  return template.replace('__VERSION__',version).replace('__FILES__',JSON.stringify(files)).replace('__PRECACHE__',JSON.stringify(precache));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const out=render();fs.writeFileSync(path.join(dist,'sw.js'),out);const m=manifest();
  console.log('dist/sw.js version',m.version,'·',Object.keys(m.files).length,'files,',m.precache.length,'precached');
}
