'use strict';
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const source = PNG.sync.read(fs.readFileSync(path.join(root, 'platforms/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')));
const icon = new PNG({ width:256, height:256 });
for (let y=0;y<256;y++) for(let x=0;x<256;x++) {
  const from = (Math.floor(y*source.height/256)*source.width+Math.floor(x*source.width/256))*4;
  source.data.copy(icon.data, (y*256+x)*4, from, from+4);
}
const png = PNG.sync.write(icon);
const header = Buffer.alloc(22);
header.writeUInt16LE(1,2); header.writeUInt16LE(1,4);
header.writeUInt16LE(1,10); header.writeUInt16LE(32,12);
header.writeUInt32LE(png.length,14); header.writeUInt32LE(22,18);
fs.mkdirSync(path.join(root,'.build'),{recursive:true});
fs.writeFileSync(path.join(root,'.build/icon.ico'),Buffer.concat([header,png]));
console.log('Windows icon generated from the existing application artwork.');
