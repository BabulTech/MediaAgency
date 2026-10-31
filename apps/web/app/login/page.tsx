'use client';
import { FormEvent, useState } from 'react';
import { Card, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function LoginPage() {
  const { t, toggleLang } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      window.location.href = '/calculators';
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(t(status === 423 ? 'locked' : status ? 'badLogin' : 'apiDown'));
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <Card title={t('appName')}>
        <form className="stack" onSubmit={submit}>
          <Field label={t('email')}><input className="input" type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label={t('password')}><input className="input" type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <p className="error">{error}</p>}
          <button className="btn primary" disabled={busy}>{t('login')}</button>
          <button type="button" className="btn" onClick={toggleLang}>{t('language')}</button>
        </form>
      </Card>
    </main>
  );
}
