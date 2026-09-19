import assert from 'node:assert/strict';
import './dist/project-format.js';
const p={format:'icaviot-project',version:1,name:'Bottom logo',source:'Design Mainline',settings:{},image:null,bottomBrand:{enabled:true,surface:'inside',width:13,height:9.725,centerX:15.5,centerZ:7}};
assert.deepEqual(ProjectFormat.decode(JSON.stringify(p)).bottomBrand,{...p.bottomBrand,depthMm:.6,relief:'raised'});
for(const b of [{...p.bottomBrand,width:Infinity},{...p.bottomBrand,surface:'side'},{...p.bottomBrand,enabled:'yes'}])assert.throws(()=>ProjectFormat.decode(JSON.stringify({...p,bottomBrand:b})));
console.log('Bottom branding roundtrip and invalid fields passed');

assert.equal(ProjectFormat.decode(JSON.stringify({...p,settings:{depthMm:1.2,relief:'carved'}})).bottomBrand.depthMm,1.2);
assert.equal(ProjectFormat.decode(JSON.stringify({...p,bottomBrand:{...p.bottomBrand,depthMm:.4,relief:'carved'}})).bottomBrand.relief,'carved');
