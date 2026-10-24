#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const DIST = path.resolve(ROOT, '../dist');
const META = path.join(DIST, 'metadata');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function files(dir, prefix='') {
  return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en')).flatMap(e=>{
    const rel=prefix+e.name;
    return e.isDirectory()?files(path.join(dir,e.name),rel+'/'):[rel];
  });
}
function run(script) {
  const result = spawnSync(process.env.npm_execpath ? process.execPath : (process.platform==='win32'?'cmd.exe':'npm'),
    process.env.npm_execpath ? [process.env.npm_execpath,'run',script] : (process.platform==='win32'?['/d','/c','npm','run',script]:['run',script]),{cwd:ROOT,stdio:'inherit'});
  if(result.error) throw result.error;
  if(result.status!==0) throw Error(script+' failed ('+result.status+')');
}
function copyTree(source,dest) {
  const resolved=path.resolve(dest);
  if(!resolved.startsWith(DIST+path.sep)) throw Error('Unsafe release path');
  fs.rmSync(resolved,{recursive:true,force:true});
  fs.cpSync(source,resolved,{recursive:true,filter:p=>!['.git','.gradle','build','node_modules','xcuserdata','DerivedData','local.properties','project.private.config.json'].includes(path.basename(p))});
}
function assets() {
  if(require('./sync-platforms.js').main('all')) throw Error('Resource synchronization failed');
  copyTree(path.join(ROOT,'.build/web'),path.join(DIST,'web'));
  copyTree(path.join(ROOT,'platforms/ios'),path.join(DIST,'ios'));
  copyTree(path.join(ROOT,'platforms/wechat'),path.join(DIST,'wechat'));
  for(const kind of ['web','ios','wechat']) {
    fs.copyFileSync(path.join(ROOT,'LICENSE'),path.join(DIST,kind,'LICENSE'));
    fs.copyFileSync(path.join(ROOT,'docs/THIRD_PARTY_NOTICES.md'),path.join(DIST,kind,'THIRD_PARTY_NOTICES.md'));
  }
}
function metadata(rebuilt=[]) {
  fs.mkdirSync(META,{recursive:true});
  const target=path.join(META,'build-info.json');
  const info=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,'utf8')):{artifacts:{}};
  info.version=require('../package.json').version;
  info.source='repo/';
  info.node=process.version;
  info.lockfileSha256=hash(path.join(ROOT,'package-lock.json'));
  for(const kind of ['windows','android']) {
    const dir=path.join(DIST,kind);
    if(!fs.existsSync(dir)) continue;
    for(const rel of files(dir).filter(f=>/\.(exe|apk)$/.test(f))) {
      const key=kind+'/'+rel, sha256=hash(path.join(dir,rel));
      const previous=info.artifacts[key];
      info.artifacts[key]={sha256,provenance:rebuilt.includes(kind)?'rebuilt-from-repo':previous?.sha256===sha256?previous.provenance:'preserved-original-not-yet-rebuilt'};
    }
  }
  fs.writeFileSync(target,JSON.stringify(info,null,2)+'\n');
  const entries=files(DIST).filter(f=>f!=='metadata/SHA256SUMS.txt').map(f=>hash(path.join(DIST,f))+'  '+f);
  fs.writeFileSync(path.join(META,'SHA256SUMS.txt'),entries.join('\n')+'\n');
  console.log('Release manifest: '+entries.length+' files');
}
function verify() {
  const list=fs.readFileSync(path.join(META,'SHA256SUMS.txt'),'utf8').trim().split(/\r?\n/);
  const expected=new Set();
  for(const line of list) {
    const m=line.match(/^([a-f0-9]{64})  (.+)$/);
    if(!m) throw Error('Invalid checksum entry');
    const target=path.resolve(DIST,m[2]);
    if(!target.startsWith(DIST+path.sep)||!fs.existsSync(target)||hash(target)!==m[1]) throw Error('Checksum mismatch: '+m[2]);
    expected.add(m[2]);
  }
  for(const rel of files(DIST)) if(rel!=='metadata/SHA256SUMS.txt'&&!expected.has(rel)) throw Error('Unlisted release file: '+rel);
  console.log('Release checksums verified: '+expected.size+' files');
}
function main() {
  const mode=process.argv[2]||'all';
  if(mode==='verify') return verify();
  if(!['all','assets','windows','android','metadata'].includes(mode)) throw Error('Unknown release mode: '+mode);
  if(mode!=='metadata') assets();
  const rebuilt=[];
  if(mode==='all'||mode==='windows') {
    run('desktop:pack');
    const dest=path.join(DIST,'windows');fs.mkdirSync(dest,{recursive:true});
    for(const file of fs.readdirSync(path.join(ROOT,'.build/windows')).filter(f=>f.endsWith('.exe'))) fs.copyFileSync(path.join(ROOT,'.build/windows',file),path.join(dest,file));
    rebuilt.push('windows');
  }
  if(mode==='all'||mode==='android') {
    run('android:build');
    fs.mkdirSync(path.join(DIST,'android'),{recursive:true});
    fs.copyFileSync(path.join(ROOT,'platforms/android/app/build/outputs/apk/debug/app-debug.apk'),path.join(DIST,'android/SudokuAcademy-debug.apk'));
    rebuilt.push('android');
  }
  for(const kind of ['web','windows','android','ios','wechat']) {
    fs.mkdirSync(path.join(DIST,kind),{recursive:true});
    fs.copyFileSync(path.join(ROOT,'docs/release',kind+'.md'),path.join(DIST,kind,'README.md'));
  }
  fs.copyFileSync(path.join(ROOT,'docs/release/README.md'),path.join(DIST,'README.md'));
  metadata(rebuilt);
  verify();
}
if(require.main===module) { try {main();} catch(e){console.error(e.message);process.exitCode=1;} }
module.exports={metadata,verify};
