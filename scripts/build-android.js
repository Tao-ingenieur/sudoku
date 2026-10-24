'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
if (require('./sync-platforms.js').main('all')) process.exit(1);
const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'cmd.exe' : './gradlew', windows ? ['/d','/c','gradlew.bat','--no-daemon','assembleDebug'] : ['--no-daemon','assembleDebug'],{cwd:path.join(root,'platforms/android'),stdio:'inherit'});
if(result.error) throw result.error;
process.exitCode=result.status ?? 1;
