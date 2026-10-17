// node brand-labels-tests.mjs : web/desktop keep "Foger Sleeve"; the phone build flag or Capacitor native switch to neutral labels.
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const src=fs.readFileSync(new URL('./dist/brand-labels.js',import.meta.url),'utf8');
const load=g=>{const ctx={...g};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src+';this.__L=CaviotLabels;',ctx);return ctx.__L};
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;console.log('PASS',m)};
const web=load({});ok(!web.native&&web.template==='Foger Sleeve'&&web.templateFile==='Foger-Sleeve','web: Foger Sleeve');
ok(web.t('the Foger Sleeve')==='the Foger Sleeve','web: text unchanged');
const desktopLike=load({Capacitor:{isNativePlatform:()=>false}});ok(!desktopLike.native,'Capacitor web platform stays Foger Sleeve');
const flag=load({CAVIOT_NEUTRAL_LABELS:true});ok(flag.native&&flag.template==='Classic Sleeve'&&flag.templateFile==='Classic-Sleeve','build flag: Classic Sleeve');
ok(flag.t('plain Foger Sleeve, file x_Foger-Sleeve_y')==='plain Classic Sleeve, file x_Classic-Sleeve_y','build flag: text rewritten');
const cap=load({Capacitor:{isNativePlatform:()=>true}});ok(cap.native&&cap.template==='Classic Sleeve','Capacitor native: Classic Sleeve');
const broken=load({Capacitor:{isNativePlatform:()=>{throw Error('x')}}});ok(!broken.native,'a throwing Capacitor check falls back to web labels');
ok(['geek-bar-pulse','geek-bar-pulse-x','foger-switch-pro','foger-switch-pro-full'].every(id=>flag.hiddenPresets.includes(id)),'all vape presets are listed as hidden');
const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
ok(html.indexOf('brand-labels.js')<html.indexOf('device-tier.js')&&html.indexOf('brand-labels.js')<html.indexOf('template-ui.js'),'brand-labels.js loads before the scripts that use it');
const presets=[...html.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]);ok(flag.hiddenPresets.every(id=>presets.includes(id)),'hidden ids match the preset list');
console.log(n+' brand label checks passed');
