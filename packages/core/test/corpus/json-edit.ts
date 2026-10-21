/** Edits of a JSON sample by a dotted path such as `windows.0.views.0.id`, for tests that break it. */
type Json = Record<string, unknown>;

function parentOf(root: Json, path: string): [Json, string] {
  const keys = path.split('.');
  const last = keys.pop() ?? '';
  const parent = keys.reduce<unknown>((value, key) => (value as Json)[key], root);
  return [parent as Json, last];
}

export function set(root: Json, path: string, value: unknown): void {
  const [parent, key] = parentOf(root, path);
  parent[key] = value;
}

export function unset(root: Json, path: string): void {
  const [parent, key] = parentOf(root, path);
  Reflect.deleteProperty(parent, key);
}
