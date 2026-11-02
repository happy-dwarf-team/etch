// The live scene's helper (docs/media.md, "The live scene"), loaded beside Etch through a second
// --extensionDevelopmentPath in the capture's throwaway VS Code only. Through Etch's API for its own
// tools (`activate`'s return value, not a stable API) it gives the live game the run's player
// profile instead of the user's: a copy of their settings with the game windowed at the scene's
// resolution, and the save the scene plays. It answers the two first-use confirmations a user
// answers once, and turns Tongs' pipe on, with input, in the run's private install, so that the
// scene can open the province view and find its widgets. Nothing here reaches the user's profile,
// their saves or their own private install. The pipeline passes its settings in ETCH_MEDIA_LIVE, a
// JSON file: { "player": "<profile folder>", "ready": "<file the helper writes when hooked>" }.
'use strict';
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');

exports.activate = async () => {
  const file = process.env.ETCH_MEDIA_LIVE;
  if (file === undefined) return;
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const etch = vscode.extensions.getExtension('happy-dwarf-team.etch');
  const game = (await etch.activate()).liveGame;
  const install = game.install;
  for (const [owner, name] of [
    [game, 'playerProfile'],
    [game, 'confirmFirstStart'],
    [install, 'confirmCreate'],
    [install, 'prepare'],
  ]) {
    if (typeof owner[name] !== 'function') throw new Error(`Etch has no ${name} to hook`);
  }
  game.playerProfile = async () => config.player;
  game.confirmFirstStart = async () => true;
  install.confirmCreate = async () => true;
  const prepare = install.prepare.bind(install);
  install.prepare = async (options) => {
    const prepared = await prepare(options);
    if (prepared !== undefined) {
      // After Etch removed it: Tongs' settings are the install's, never the player's.
      const tongs = path.join(install.layout.game, 'anvil', 'data', 'tongs');
      fs.mkdirSync(tongs, { recursive: true });
      fs.writeFileSync(path.join(tongs, 'settings.toml'), 'enabled = true\ninput = true\n');
    }
    return prepared;
  };
  fs.writeFileSync(config.ready, `${JSON.stringify({ hooked: true })}\n`);
};

exports.deactivate = () => undefined;
