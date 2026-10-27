// A stand-in for eu4.exe with Etch's plugin in the live game tests: serves the session pipe of
// docs/plugin-protocol.md with the session id from ETCH_HOST_SESSION. Its creation time comes from
// the lock file the extension writes once it has the process's identity (argv[2]); it is ready
// after argv[3] milliseconds. With argv[4] = "exit" it ends before it is ready; with "freeze" its
// frame counter stops half a second after it is ready, and with "mute" it stops answering pings
// then, as a hung game and a dead plugin would (etch#51).
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';

const [lockFile, readyAfter = '300', mode = ''] = process.argv.slice(2);
const session = process.env['ETCH_HOST_SESSION'] ?? '';
const started = Date.now();
if (mode === 'exit') setTimeout(() => process.exit(3), 200);

function startMs(): number {
  for (;;) {
    try {
      const lock = JSON.parse(readFileSync(lockFile ?? '', 'utf8')) as {
        game?: { pid: number; creationFileTime: string };
      };
      if (lock.game?.pid === process.pid) {
        return Number((BigInt(lock.game.creationFileTime) - 116444736000000000n) / 10000n);
      }
    } catch {
      // Not written yet.
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
}

const ready = (): boolean => Date.now() - started >= Number(readyAfter);
const stuck = (): boolean => Date.now() - started >= Number(readyAfter) + 500;
let frame = 0;
setInterval(() => {
  if (mode !== 'freeze' || !stuck()) frame++;
}, 10);
createServer((socket) => {
  let buffered = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    buffered += chunk;
    for (let end = buffered.indexOf('\n'); end >= 0; end = buffered.indexOf('\n')) {
      const request = JSON.parse(buffered.slice(0, end)) as { id: number; type: string };
      buffered = buffered.slice(end + 1);
      if (mode === 'mute' && request.type === 'ping' && stuck()) continue;
      const answer =
        request.type === 'hello'
          ? {
              ok: true,
              protocol: 2,
              plugin: '0.0.0-test',
              session,
              pid: process.pid,
              process_start_ms: startMs(),
              ready: ready(),
              frame,
            }
          : request.type === 'ping'
            ? {
                ok: true,
                ready: ready(),
                frame,
                responding: mode !== 'freeze',
                busy: false,
                game_session: null,
              }
            : { ok: false, error: 'unknown_type', message: 'unknown' };
      socket.write(`${JSON.stringify({ id: request.id, ...answer })}\n`);
    }
  });
}).listen(`\\\\.\\pipe\\etch-host-${session}`);
