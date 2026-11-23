/**
 * Numbers in the text Etch shows: thousands separators, so 7826 reads "7,826" (etch#648,
 * finding P3.18). English, like every other word Etch writes.
 */
export function count(n: number): string {
  return n.toLocaleString('en-US');
}

/** A count with its noun, for the notifications: "1 error.log line", "2 error.log lines". */
export function counted(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}
