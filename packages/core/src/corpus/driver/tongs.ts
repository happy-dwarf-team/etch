/**
 * A client of Tongs' pipe (`\\.\pipe\tongs`, tongs README "Commands"): one line of text per
 * request, one JSON object per answer, in order on one connection.
 */
import { connect, type Socket } from 'node:net';

/** A Tongs answer: `ok`, and `error` when it is false, with the command's own fields. */
export type TongsAnswer = Readonly<Record<string, unknown>> & {
  readonly ok: boolean;
  readonly error?: string;
};

/** The part of a Tongs connection the capture driver uses, so that tests can stand in for it. */
export interface Tongs {
  /** Sends one command and resolves with its answer; rejects only when the pipe fails. */
  call(command: string, timeoutMs?: number): Promise<TongsAnswer>;
  close(): void;
}

export const TONGS_PIPE = '\\\\.\\pipe\\tongs';

/** Connects to the Tongs pipe; rejects when no game with Tongs is listening. */
export async function connectTongs(pipe = TONGS_PIPE): Promise<Tongs> {
  const socket = await new Promise<Socket>((resolve, reject) => {
    const s = connect(pipe);
    s.once('connect', () => {
      s.off('error', reject);
      resolve(s);
    });
    s.once('error', reject);
  });
  socket.setEncoding('utf8');
  let buffer = '';
  let failure: Error | undefined;
  const waiting: { resolve: (line: string) => void; reject: (error: Error) => void }[] = [];
  socket.on('data', (data: string) => {
    buffer += data;
    for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end).replace(/\r$/, '');
      buffer = buffer.slice(end + 1);
      waiting.shift()?.resolve(line);
    }
  });
  const fail = (error: Error): void => {
    failure ??= error;
    for (const w of waiting.splice(0)) w.reject(error);
  };
  socket.on('error', fail);
  socket.on('close', () => {
    fail(new Error('The Tongs pipe closed.'));
  });

  return {
    async call(command: string, timeoutMs = 30_000): Promise<TongsAnswer> {
      if (failure !== undefined) throw failure;
      if (/[\r\n]/.test(command)) throw new Error('A Tongs command is one line.');
      const line = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          // The answer would arrive out of order later: the connection is no longer usable.
          const error = new Error(`Tongs did not answer "${command}" in ${String(timeoutMs)} ms.`);
          fail(error);
          socket.destroy();
          reject(error);
        }, timeoutMs);
        waiting.push({
          resolve: (l) => {
            clearTimeout(timer);
            resolve(l);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        socket.write(`${command}\n`);
      });
      const answer = JSON.parse(line) as unknown;
      if (typeof answer !== 'object' || answer === null || !('ok' in answer)) {
        throw new Error(`Tongs answered "${command}" with something other than a JSON answer.`);
      }
      return answer as TongsAnswer;
    },
    close(): void {
      socket.end();
    },
  };
}
