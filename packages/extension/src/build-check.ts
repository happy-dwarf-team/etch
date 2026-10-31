// Warns when the extension's files on disk are no longer the build this window runs: a VSIX of
// the same version installed over it, or the extension uninstalled, without a reload. Checked
// when dist/build.json changes, when the window gets the focus back and when a live game starts
// (the private install copies the plugin from these files), once for each build found on disk.
import * as vscode from 'vscode';
import { describeBuild, readStamp, sameBuild, type BuildStamp } from './build-stamp.ts';

const RELOAD = 'Reload Window';

export class BuildCheck implements vscode.Disposable {
  private readonly running: BuildStamp;
  private readonly file: vscode.Uri;
  private readonly output: vscode.LogOutputChannel;
  private readonly subscriptions: vscode.Disposable[];
  /** The builds on disk already warned about, so each is told once. */
  private readonly told = new Set<string>();

  constructor(running: BuildStamp, extensionUri: vscode.Uri, output: vscode.LogOutputChannel) {
    this.running = running;
    this.file = vscode.Uri.joinPath(extensionUri, 'dist', 'build.json');
    this.output = output;
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(extensionUri, 'dist'), 'build.json'),
    );
    const check = (): void => {
      void this.check();
    };
    this.subscriptions = [
      watcher,
      watcher.onDidChange(check),
      watcher.onDidCreate(check),
      watcher.onDidDelete(check),
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) check();
      }),
    ];
  }

  dispose(): void {
    for (const s of this.subscriptions) s.dispose();
  }

  /**
   * Compares the build on disk with the running one; warns once for each other build found and
   * resolves once the warning is shown, not answered.
   */
  async check(): Promise<void> {
    const disk = await readStamp(this.file.fsPath);
    if (sameBuild(this.running, disk)) return;
    const key = disk === undefined ? 'missing' : JSON.stringify(disk);
    if (this.told.has(key)) return;
    this.told.add(key);
    const running = describeBuild(this.running);
    const message =
      disk === undefined
        ? `Etch's files on disk changed (uninstalled or being replaced), but this window still runs Etch ${running}. Reload the window to run what is installed.`
        : `Etch ${describeBuild(disk)} is installed, but this window still runs Etch ${running}. Reload the window to run the installed build.`;
    this.output.warn(message);
    void vscode.window.showWarningMessage(message, RELOAD).then((chosen) => {
      if (chosen === RELOAD) void vscode.commands.executeCommand('workbench.action.reloadWindow');
    });
  }
}
