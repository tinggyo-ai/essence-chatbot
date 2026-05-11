const { spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

const electronExe = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const logPath   = path.join(__dirname, 'aria-log.txt');
const logStream = fs.createWriteStream(logPath, { flags: 'w' });

const child = spawn(electronExe, ['.'], {
    cwd: __dirname,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
});

child.stdout.pipe(logStream);
child.stderr.pipe(logStream);

child.on('close', (code) => {
    // 파일 핸들을 완전히 닫은 뒤 node 프로세스 종료
    // (닫지 않으면 uninstall 시 aria-log.txt가 잠겨 rmdir 실패)
    logStream.end(() => {
        process.exit(0);
    });
});

console.log('ARIA 시작됨! (PID:', child.pid, ')');
