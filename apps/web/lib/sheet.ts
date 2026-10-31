export type Rec = Record<string, unknown>;

const download = (blob: Blob, fileName: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
};

/** Stops a spreadsheet treating imported or customer text as a formula. Plain numbers pass through. */
const safe = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
};
const cell = (v: unknown) => `"${safe(v).replace(/"/g, '""')}"`;

export const columnsOf = (rows: Rec[]) => [...new Set(rows.flatMap((r) => Object.keys(r)))];

export function exportCsv(name: string, headers: string[], keys: string[], rows: Rec[]) {
  const csv = [headers.map(cell).join(','), ...rows.map((r) => keys.map((k) => cell(r[k])).join(','))].join('\r\n');
  download(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), `${name}.csv`); // BOM keeps Urdu intact in Excel
}

export async function exportXlsx(name: string, headers: string[], keys: string[], rows: Rec[]) {
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(name.slice(0, 31));
  sheet.addRow(headers).font = { bold: true };
  for (const r of rows) {
    sheet.addRow(keys.map((k) => {
      const s = safe(r[k]);
      return s !== '' && !Number.isNaN(Number(s)) && !/^0\d/.test(s) ? Number(s) : s;
    }));
  }
  sheet.columns.forEach((c) => { c.width = 20; });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  download(new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [[]];
  let field = ''; let quoted = false;
  const body = text.replace(/^﻿/, '');
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { rows[rows.length - 1].push(field); field = ''; }
    else if (c === '\n') { rows[rows.length - 1].push(field.replace(/\r$/, '')); field = ''; rows.push([]); }
    else field += c;
  }
  rows[rows.length - 1].push(field);
  return rows;
}

/** Reads the first sheet of an .xlsx, or a .csv, into objects keyed by the header row. */
export async function readRows(file: File): Promise<Rec[]> {
  let grid: string[][];
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import('exceljs')).default;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    grid = [];
    book.worksheets[0].eachRow({ includeEmpty: false }, (row) => {
      const out: string[] = [];
      for (let i = 1; i <= row.cellCount; i++) out.push(row.getCell(i).text.trim());
      grid.push(out);
    });
  } else grid = parseCsv(await file.text());
  const [header = [], ...lines] = grid;
  const names = header.map((h) => h.trim());
  return lines.filter((l) => l.some((c) => c.trim())).map((l) => Object.fromEntries(names.map((n, i) => [n, (l[i] ?? '').trim()])));
}
