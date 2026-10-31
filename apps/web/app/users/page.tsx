'use client';
import { FormEvent, useState } from 'react';
import { Card, Field, Select, useLoad } from '@/components/ui';
import { api, Role, User } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function UsersPage() {
  const { t } = useI18n();
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: '' });
  const [message, setMessage] = useState('');
  const { data, error } = useLoad(async () => {
    const [users, roles] = await Promise.all([api<User[]>('/users'), api<Role[]>('/roles')]);
    return { users, roles };
  }, { users: [] as User[], roles: [] as Role[] }, [version]);
  const role = form.role || data.roles[0]?.code || '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      await api('/users', { method: 'POST', body: JSON.stringify({ name: form.name, email: form.email, password: form.password, roleCodes: [role] }) });
      setForm({ name: '', email: '', password: '', role });
      setVersion((v) => v + 1);
    } catch { setMessage(t('saveFailed')); }
  }

  async function toggle(u: User) {
    try {
      await api(`/users/${u.id}/active`, { method: 'PATCH', body: JSON.stringify({ active: !u.active }) });
      setVersion((v) => v + 1);
    } catch { setMessage(t('saveFailed')); }
  }

  if (error) return <p className="error">{t('accessDenied')}</p>;
  return (
    <div className="stack">
      <h1>{t('users')}</h1>
      <Card>
        {data.users.map((u) => (
          <div className="row" key={u.id}>
            <span><b>{u.name}</b><br /><small className="muted" dir="ltr">{u.email} · {u.roles.join(', ')}</small></span>
            <button type="button" className="btn" onClick={() => toggle(u)}>{t(u.active ? 'deactivate' : 'activate')}</button>
          </div>
        ))}
      </Card>
      <Card title={t('addUser')}>
        <form className="grid2" onSubmit={submit}>
          <Field label={t('name')}><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('email')}><input className="input" type="email" dir="ltr" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={t('password')}><input className="input" type="password" dir="ltr" autoComplete="new-password" required minLength={10} placeholder={t('passwordHint')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Select label={t('role')} value={role} onChange={(v) => setForm({ ...form, role: v })} options={data.roles.map((r) => ({ value: r.code, label: r.name }))} />
          <div className="span2"><button className="btn primary">{t('save')}</button>{message && <p className="error">{message}</p>}</div>
        </form>
      </Card>
    </div>
  );
}
