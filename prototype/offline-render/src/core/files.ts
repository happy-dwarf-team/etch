// PROTOTYPE (etch#9): virtual file system over the game folder plus mods. Throwaway.
// Hypothesis: a later mod in the list replaces an earlier one's file at the same path.
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Root { name: string; dir: string; replace: string[] }

export class Files {
  private byRel = new Map<string, string>(); // lower-case rel path -> absolute file
  readonly roots: Root[];
  readonly dec = new TextDecoder('windows-1252');

  constructor(roots: Root[], dirs: string[]) {
    this.roots = roots;
    for (const r of roots) {
      for (const rp of r.replace) {
        const pre = rp.toLowerCase().replace(/\\/g, '/').replace(/\/$/, '') + '/';
        for (const k of [...this.byRel.keys()]) if (k.startsWith(pre)) this.byRel.delete(k);
      }
      for (const d of dirs) this.walk(r.dir, d);
    }
  }

  private walk(root: string, rel: string) {
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const r = rel + '/' + e.name;
      if (e.isDirectory()) this.walk(root, r);
      else this.byRel.set(r.toLowerCase(), path.join(root, r));
    }
  }

  resolve(rel: string): string | undefined {
    const norm = rel.replace(/\\/g, '/').replace(/\/+/g, '/');
    const hit = this.byRel.get(norm.toLowerCase());
    if (hit) return hit;
    for (let i = this.roots.length - 1; i >= 0; i--) { // outside the indexed folders
      const f = path.join(this.roots[i].dir, norm);
      if (fs.existsSync(f)) return f;
    }
    return undefined;
  }

  list(prefix: string, ext: string): string[] {
    const p = prefix.toLowerCase(); const out: string[] = [];
    for (const [k, v] of this.byRel) if (k.startsWith(p) && k.endsWith(ext)) out.push(v);
    return out.sort();
  }

  text(abs: string): string { return this.dec.decode(fs.readFileSync(abs)); }
}

/** Roots from the game folder and the launcher's dlc_load.json (enabled mods, in file order). */
export function rootsFromPlayset(game: string, userDir: string | undefined, playset?: string): Root[] {
  const roots: Root[] = [{ name: 'vanilla', dir: game, replace: [] }];
  if (!userDir) return roots;
  const dl = JSON.parse(fs.readFileSync(playset ?? path.join(userDir, 'dlc_load.json'), 'utf8'));
  for (const m of dl.enabled_mods as string[]) {
    const desc = fs.readFileSync(path.join(userDir, m), 'utf8');
    const name = /^name\s*=\s*"([^"]*)"/m.exec(desc)?.[1] ?? m;
    const dir = /^path\s*=\s*"([^"]*)"/m.exec(desc)?.[1];
    if (!dir) continue;
    const replace = [...desc.matchAll(/^replace_path\s*=\s*"([^"]*)"/gm)].map(x => x[1]);
    roots.push({ name, dir, replace });
  }
  return roots;
}
