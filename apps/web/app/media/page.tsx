'use client';
import { FormEvent, useState } from 'react';
import { Card, Field, Select, useLoad } from '@/components/ui';
import { api, Category, Organization, Outlet } from '@/lib/api';
import { ExportBar } from '@/components/ExportBar';
import { useI18n } from '@/lib/i18n';

export default function MediaPage() {
  const { t } = useI18n();
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState({ name: '', code: '', categoryId: '', organizationId: '' });
  const [message, setMessage] = useState('');
  const { data, error } = useLoad(async () => {
    const [outlets, categories, organizations] = await Promise.all([api<Outlet[]>('/outlets'), api<Category[]>('/categories'), api<Organization[]>('/organizations')]);
    return { outlets, categories, organizations };
  }, { outlets: [] as Outlet[], categories: [] as Category[], organizations: [] as Organization[] }, [version]);

  const categoryId = form.categoryId || data.categories[0]?.id || '';
  const organizationId = form.organizationId || data.organizations[0]?.id || '';
  const nameOf = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      await api('/outlets', { method: 'POST', body: JSON.stringify({ name: form.name, code: form.code, categoryId, organizationId }) });
      setForm({ ...form, name: '', code: '' });
      setVersion((v) => v + 1);
    } catch (err) {
      setMessage(t((err as { status?: number }).status === 409 ? 'duplicateCode' : 'saveFailed'));
    }
  }

  return (
    <div className="stack">
      <h1>{t('media')}</h1>
      <ExportBar name="outlets" rows={data.outlets.map((o) => ({ code: o.code, name: o.name, category: data.categories.find((c) => c.id === o.categoryId)?.name, organization: data.organizations.find((c) => c.id === o.organizationId)?.name }))} />
      {error && <p className="error">{t('apiDown')}</p>}
      <Card title={t('outlets')}>
        {data.outlets.length === 0 && <p className="muted">{t('noRecords')}</p>}
        {data.outlets.map((o) => (
          <div className="row" key={o.id}>
            <span><b>{o.name}</b><br /><small className="muted">{o.code} · {nameOf(data.categories, o.categoryId)}</small></span>
            <small className="muted">{nameOf(data.organizations, o.organizationId)}</small>
          </div>
        ))}
      </Card>
      <Card title={t('addOutlet')}>
        <form className="grid2" onSubmit={submit}>
          <Field label={t('name')}><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('code')}><input className="input" required dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
          <Select label={t('category')} value={categoryId} onChange={(v) => setForm({ ...form, categoryId: v })} options={data.categories.map((c) => ({ value: c.id, label: c.name }))} />
          <Select label={t('organization')} value={organizationId} onChange={(v) => setForm({ ...form, organizationId: v })} options={data.organizations.map((c) => ({ value: c.id, label: c.name }))} />
          <div className="span2"><button className="btn primary" disabled={error}>{t('save')}</button>{message && <p className="error">{message}</p>}</div>
        </form>
      </Card>
    </div>
  );
}
