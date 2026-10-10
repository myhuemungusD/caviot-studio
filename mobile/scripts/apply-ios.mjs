// Copies the local plugin into the Xcode project and keeps privacy strings, the bridge
// controller, and the iOS 16.4 deployment target in place after `cap sync`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(mobileRoot, 'ios', 'App', 'App');
const project = path.join(mobileRoot, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
const sourceDir = path.join(mobileRoot, 'native', 'ios');

for (const file of ['CaviotNativePlugin.swift', 'CaviotBridgeViewController.swift', 'PrivacyInfo.xcprivacy']) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(appDir, file));
}

const storyboardPath = path.join(appDir, 'Base.lproj', 'Main.storyboard');
const storyboard = fs.readFileSync(storyboardPath, 'utf8')
  .replace('customClass="CAPBridgeViewController" customModule="Capacitor"', 'customClass="CaviotBridgeViewController" customModule="App"');
fs.writeFileSync(storyboardPath, storyboard);

const scenePath = path.join(appDir, 'SceneDelegate.swift');
fs.writeFileSync(scenePath, fs.readFileSync(scenePath, 'utf8').replace('CAPBridgeViewController()', 'CaviotBridgeViewController()'));

const plistPath = path.join(appDir, 'Info.plist');
let plist = fs.readFileSync(plistPath, 'utf8');
const entries = [
  ['NSCameraUsageDescription', '<string>Caviot Studio uses the camera so you can photograph a logo and place it on a sleeve. The photo stays on this device.</string>'],
  ['NSPhotoLibraryUsageDescription', '<string>Caviot Studio opens your photos so you can choose a logo to place on a sleeve. The photo stays on this device.</string>'],
  ['UIFileSharingEnabled', '<true/>'],
  ['LSSupportsOpeningDocumentsInPlace', '<true/>'],
  ['ITSAppUsesNonExemptEncryption', '<false/>'],
  ['LSApplicationCategoryType', '<string>public.app-category.graphics-design</string>']
];
plist = plist.replace('<string>armv7</string>', '<string>arm64</string>');
for (const [key, value] of entries) {
  if (plist.includes('<key>' + key + '</key>')) continue;
  plist = plist.replace('</dict>\n</plist>', '\t<key>' + key + '</key>\n\t' + value + '\n</dict>\n</plist>');
}
fs.writeFileSync(plistPath, plist);

let pbx = fs.readFileSync(project, 'utf8');
const files = [
  ['C0A7100100000000000000A1', 'C0A7100100000000000000A2', 'CaviotNativePlugin.swift', 'sourcecode.swift', 'Sources'],
  ['C0A7100100000000000000B1', 'C0A7100100000000000000B2', 'CaviotBridgeViewController.swift', 'sourcecode.swift', 'Sources'],
  ['C0A7100100000000000000C1', 'C0A7100100000000000000C2', 'PrivacyInfo.xcprivacy', 'text.plist.xml', 'Resources']
];
for (const [ref, build, name, type, phase] of files) {
  if (pbx.includes(name)) continue;
  const buildFile = `\t\t${build} /* ${name} in ${phase} */ = {isa = PBXBuildFile; fileRef = ${ref} /* ${name} */; };\n`;
  const fileRef = `\t\t${ref} /* ${name} */ = {isa = PBXFileReference; lastKnownFileType = ${type}; path = ${name}; sourceTree = "<group>"; };\n`;
  pbx = pbx.replace('/* End PBXBuildFile section */', buildFile + '/* End PBXBuildFile section */');
  pbx = pbx.replace('/* End PBXFileReference section */', fileRef + '/* End PBXFileReference section */');
  pbx = pbx.replace('504EC3071FED79650016851F /* AppDelegate.swift */,', `504EC3071FED79650016851F /* AppDelegate.swift */,\n\t\t\t\t${ref} /* ${name} */,`);
  const phaseEnd = phase === 'Sources'
    ? '9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */,'
    : '2FAD9763203C412B000D30F8 /* config.xml in Resources */,';
  pbx = pbx.replace(phaseEnd, `${phaseEnd}\n\t\t\t\t${build} /* ${name} in ${phase} */,`);
}
pbx = pbx.replaceAll('IPHONEOS_DEPLOYMENT_TARGET = 15.0;', 'IPHONEOS_DEPLOYMENT_TARGET = 16.4;');
fs.writeFileSync(project, pbx);
console.log('Applied iOS privacy strings, bridge controller, and deployment target 16.4');
