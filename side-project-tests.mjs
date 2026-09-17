import fs from 'node:fs';import assert from 'node:assert/strict';await import('./dist/project-format.js');
const settings={designAngle:0,designY:44.5,designWidth:30,designHeight:35,designRotation:0,bgR:255,bgG:255,bgB:255,bgTol:40,smoothPasses:0,letterSpacing:0,letterThickness:0,bgEnable:true,bgSoft:false,mirror:false,invert:true};
const p={format:'icaviot-project',version:2,name:'Both sides',source:'Front',settings:{mode:'sleeve'},image:null,activeSide:1,linkSides:true,sides:[{image:'data:image/png;base64,AAAA',source:'Front',settings},{image:'data:image/png;base64,BBBB',source:'Back',settings:{...settings,designAngle:180,designHeight:50}}]};
const decoded=ProjectFormat.decode(JSON.stringify(p));assert.equal(decoded.sides[1].settings.designHeight,50);assert.equal(decoded.activeSide,1);assert(decoded.linkSides);
for(const mutate of [q=>q.sides[1].settings.designWidth=-1,q=>q.sides[0].image='https://example.com/image.png',q=>q.activeSide=2,q=>q.sides.pop()]){const q=structuredClone(p);mutate(q);assert.throws(()=>ProjectFormat.decode(JSON.stringify(q)));}
const old={format:'icaviot-project',version:1,name:'Old',source:'Old',settings:{},image:null};assert.equal(ProjectFormat.decode(JSON.stringify(old)).version,1);
console.log('Two-sided project roundtrip, linked state, malformed input rejection and legacy compatibility passed.');
