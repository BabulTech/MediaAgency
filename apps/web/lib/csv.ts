export interface RuleRow { formatCode: string | null; editionCode: string | null; timeBandCode: string | null; priority: number; unit: string; rate: string; multiplier: string | null; minimumCharge: string | null }

const COLUMNS: (keyof RuleRow)[] = ['formatCode', 'editionCode', 'timeBandCode', 'priority', 'unit', 'rate', 'multiplier', 'minimumCharge'];

export const rulesToCsv = (rules: RuleRow[]) =>
  [COLUMNS.join(','), ...rules.map((r) => COLUMNS.map((c) => r[c] ?? '').join(','))].join('\n');

/** Values are codes and numbers, so quoted commas are not supported. The server validates every row. */
export function csvToRules(text: string) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const names = header.split(',').map((h) => h.trim());
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    return Object.fromEntries(names.map((n, i) => [n, cells[i] ?? '']));
  });
}
