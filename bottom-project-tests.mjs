import assert from 'node:assert/strict';
import './dist/project-format.js';
// Bottom branding is now part of the Foger Sleeve template. Older project files still carry the old settings
// (sometimes out of range); they must open without error and the fields are dropped.
const p={format:'icaviot-project',version:1,name:'Bottom logo',source:'Design Mainline',settings:{},image:null,bottomBrand:{enabled:true,surface:'inside',width:13,height:9.725,centerX:15.5,centerZ:7}};
assert.equal(ProjectFormat.decode(JSON.stringify(p)).bottomBrand,undefined);
for(const b of [{...p.bottomBrand,width:Infinity},{...p.bottomBrand,surface:'side'},{...p.bottomBrand,enabled:'yes'},{...p.bottomBrand,logo:'other'}])assert.equal(ProjectFormat.decode(JSON.stringify({...p,bottomBrand:b})).bottomBrand,undefined);
assert.equal(ProjectFormat.decode(JSON.stringify({...p,settings:{depthMm:1.2,relief:'carved'}})).name,'Bottom logo');
console.log('Old bottom branding fields load and are dropped: passed');
