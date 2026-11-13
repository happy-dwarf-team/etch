// Running programs, and reading the process table, on the machine the player sits at. Natively that is this process's
// own machine. Inside a Flatpak sandbox (VS Code from Flathub) it is the host: the sandbox has its own process
// namespace and cannot run Proton, so programs are started through `flatpak-spawn --host` (the sandbox needs the
// `org.freedesktop.Flatpak=talk` permission, which Flathub's VS Code has) and the host's /proc is read through it too.
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';

/** Whether this process runs inside a Flatpak sandbox. */
export function isFlatpak(): boolean {
  return process.platform !== 'win32' && existsSync('/.flatpak-info');
}

/** Starts a program on the host with `env` added to the environment; it does not keep this process alive. */
export function hostSpawn(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
    readonly flatpak?: boolean;
  },
): ChildProcess {
  if (options.flatpak ?? isFlatpak()) {
    const envArgs = Object.entries(options.env).map(([name, value]) => `--env=${name}=${value}`);
    return spawn(
      'flatpak-spawn',
      ['--host', '--watch-bus', `--directory=${options.cwd}`, ...envArgs, command, ...args],
      { stdio: 'ignore' },
    );
  }
  return spawn(command, [...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: 'ignore',
  });
}

/** Runs a shell script on the host and returns its output. */
export function hostShell(script: string, flatpak = isFlatpak()): Promise<string> {
  const [command, args] = flatpak
    ? (['flatpak-spawn', ['--host', 'sh', '-c', script]] as const)
    : (['sh', ['-c', script]] as const);
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
      if (error !== null) reject(new Error(error.message, { cause: error }));
      else resolve(stdout);
    });
  });
}

/** `value` as one word for a POSIX shell: in single quotes, each single quote inside it closed, escaped and reopened. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Deletes a file on the host (a Flatpak sandbox sees most of the host's folders read-only). */
export async function hostRemove(path: string): Promise<void> {
  if (isFlatpak()) {
    await hostShell(`rm -f -- ${shellQuote(path)}`, true);
    return;
  }
  await rm(path, { force: true });
}

/**
 * The host's PID of this Flatpak instance's root process. The sandbox has its own PID namespace, so `process.pid` is not
 * a PID on the host; the instance's root process (`child-pid` in the instance's `bwrapinfo.json`) is, and it lives as
 * long as the instance does. `undefined` outside a sandbox or when it cannot be read.
 */
export async function flatpakInstancePid(): Promise<number | undefined> {
  if (!isFlatpak()) return undefined;
  try {
    const id = /^instance-id=(\d+)$/m.exec(readFileSync('/.flatpak-info', 'utf8'))?.[1];
    if (id === undefined) return undefined;
    const json = await hostShell(
      `cat "\${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/.flatpak/${id}/bwrapinfo.json"`,
      true,
    );
    const pid: unknown = (JSON.parse(json) as { 'child-pid'?: unknown })['child-pid'];
    return typeof pid === 'number' && Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}
