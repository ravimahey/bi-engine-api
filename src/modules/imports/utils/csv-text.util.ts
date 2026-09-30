/**
 * Decodes CSV bytes: UTF-8 (with or without BOM) when valid, otherwise
 * Windows-1252 — what older Excel versions write on "Save as CSV", and
 * where names like "Café" would otherwise turn into garbage.
 */
export function decodeCsv(buffer: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }
  // Drops a UTF-8 byte-order mark, which Excel adds to "CSV UTF-8" files.
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export interface CsvLayout {
  delimiter: string;
  /** Text with an Excel `sep=;` directive line removed, if there was one. */
  text: string;
}

const CANDIDATES = [',', ';', '\t', '|'];

/**
 * Works out the delimiter from the header line: an explicit `sep=X` line
 * (written by some Excel locales) wins; otherwise whichever candidate
 * appears most often outside quotes. European Excel saves CSVs with `;`.
 */
export function detectCsvLayout(text: string): CsvLayout {
  const firstLineEnd = text.search(/\r?\n/);
  const firstLine = firstLineEnd >= 0 ? text.slice(0, firstLineEnd) : text;

  const directive = /^"?sep=(.)"?$/i.exec(firstLine.trim());
  if (directive) {
    return {
      delimiter: directive[1],
      text: firstLineEnd >= 0 ? text.slice(text.indexOf('\n') + 1) : '',
    };
  }

  const counts = new Map(CANDIDATES.map((c) => [c, 0]));
  let inQuotes = false;
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && counts.has(char)) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { delimiter: best[1] > 0 ? best[0] : ',', text };
}
