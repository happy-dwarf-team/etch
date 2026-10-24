// Windows-1252, the code page the game reads interface files in (etch#15).

/** The characters of bytes 0x80–0x9F; 0 marks the five bytes the code page leaves undefined. */
const HIGH_CONTROLS = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0, 0x017d, 0, 0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161,
  0x203a, 0x0153, 0, 0x017e, 0x0178,
];

/** The character of each byte as the game reads it. */
const DECODE = new Uint16Array(256);
/** The byte a save writes for each UTF-16 code unit, or `?` (0x3F) when there is none. */
const ENCODE = new Uint8Array(65536).fill(0x3f);
/** The byte each character of game text was decoded from, or `?` (0x3F) when there is none. */
const ENCODE_DECODED = new Uint8Array(65536).fill(0x3f);

for (let byte = 0; byte < 256; byte++) {
  const mapped = byte >= 0x80 && byte < 0xa0 ? (HIGH_CONTROLS[byte - 0x80] as number) : byte;
  if (mapped || byte === 0) {
    DECODE[byte] = mapped;
    ENCODE[mapped] = byte;
  } else {
    // An undefined byte: the game text keeps it as the C1 control of the same
    // value, so nothing is lost. VS Code's encoder (iconv-lite) maps it to
    // U+FFFD instead, and writes the last such byte, 0x9D, for U+FFFD.
    DECODE[byte] = byte;
    ENCODE[0xfffd] = byte;
  }
  ENCODE_DECODED[DECODE[byte] as number] = byte;
}

const CHUNK = 8192;

/** Decodes Windows-1252 bytes; every byte becomes one character. */
export function decodeWindows1252(bytes: Uint8Array): string {
  const parts: string[] = [];
  const units = new Uint16Array(Math.min(bytes.length, CHUNK));
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.length);
    for (let i = start; i < end; i++) {
      units[i - start] = DECODE[bytes[i] as number] as number;
    }
    parts.push(String.fromCharCode(...units.subarray(0, end - start)));
  }
  return parts.join('');
}

/**
 * Encodes text as VS Code saves a Windows-1252 document: one byte per UTF-16
 * code unit, `?` for anything outside the code page (so `😀` becomes `??`).
 */
export function encodeWindows1252(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = ENCODE[text.charCodeAt(i)] as number;
  }
  return bytes;
}

/**
 * Encodes game text back into the bytes it was decoded from, the inverse of
 * {@link decodeWindows1252}: unlike a save, the five undefined bytes, kept as
 * C1 controls, come back as themselves. Anything else outside the code page
 * becomes `?`, as a save would write it.
 */
export function encodeDecodedWindows1252(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = ENCODE_DECODED[text.charCodeAt(i)] as number;
  }
  return bytes;
}
