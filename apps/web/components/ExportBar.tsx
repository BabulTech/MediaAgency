'use client';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { columnsOf, exportCsv, exportXlsx, Rec } from '@/lib/sheet';
import { DictKey } from '@/lib/dict';

export function useColumnLabel() {
  const { t } = useI18n();
  return (k: string) => t(`col_${k}` as DictKey) ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/** PDF uses the browser's print engine, which is what keeps Urdu text shaped correctly. */
export function ExportBar({ name, rows }: { name: string; rows: Rec[] }) {
  const { t } = useI18n();
  const label = useColumnLabel();
  const keys = columnsOf(rows);
  const headers = keys.map(label);
  return (
    <div className="exportbar no-print">
      <button type="button" className="btn" disabled={!rows.length} onClick={() => exportXlsx(name, headers, keys, rows)}><FileSpreadsheet size={16} />Excel</button>
      <button type="button" className="btn" disabled={!rows.length} onClick={() => exportCsv(name, headers, keys, rows)}><Download size={16} />CSV</button>
      <button type="button" className="btn" onClick={() => window.print()}><FileText size={16} />{t('exportPdf')}</button>
    </div>
  );
}
