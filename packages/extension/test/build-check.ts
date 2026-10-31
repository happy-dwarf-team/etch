// The build stamp and the warning when the extension's files on disk are another build.
import * as assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { BuildCheck } from '../src/build-check.ts';
import { RUNNING_BUILD, readStamp, sameBuild, type BuildStamp } from '../src/build-stamp.ts';

export async function testBuildCheck(extensionUri: vscode.Uri): Promise<void> {
  assert.ok(RUNNING_BUILD, 'the bundle carries its build stamp');
  const own = await readStamp(path.join(extensionUri.fsPath, 'dist', 'build.json'));
  assert.ok(sameBuild(RUNNING_BUILD, own), 'dist/build.json is the running build');

  const root = await mkdtemp(path.join(tmpdir(), 'etch-build-check-'));
  const file = path.join(root, 'dist', 'build.json');
  await mkdir(path.dirname(file), { recursive: true });
  const write = (stamp: BuildStamp): Promise<void> => writeFile(file, JSON.stringify(stamp));
  const warnings: string[] = [];
  const output = {
    warn: (message: string) => warnings.push(message),
  } as unknown as vscode.LogOutputChannel;
  const running: BuildStamp = {
    version: '1.0.1',
    commit: 'abc1234',
    builtAt: '2026-10-31T21:03:00Z',
  };
  const check = new BuildCheck(running, vscode.Uri.file(root), output);
  try {
    await write(running);
    await check.check();
    assert.equal(warnings.length, 0, 'the same build on disk: no warning');

    await write({ ...running, builtAt: '2026-10-31T21:03:39Z' });
    await check.check();
    await check.check();
    assert.equal(warnings.length, 1, 'another build of the same version is told once');
    assert.match(
      String(warnings[0]),
      /^Etch 1\.0\.1 \(abc1234\) is installed, but this window still runs Etch 1\.0\.1 \(abc1234\)/,
    );

    await rm(file);
    await check.check();
    assert.equal(warnings.length, 2, 'the files gone are told too');
    assert.match(String(warnings[1]), /^Etch's files on disk changed/);
  } finally {
    check.dispose();
    await rm(root, { recursive: true, force: true });
  }
}
