'use client';
import { FormEvent, useState } from 'react';
import { Card, Field } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error: failed } = await supabase.auth.updateUser({ password });
    if (failed) { setError(t('saveFailed')); return; }
    window.location.href = '/calculators';
  }

  return (
    <main className="login">
      <Card title={t('password')}>
        <form className="stack" onSubmit={submit}>
          <Field label={t('password')}><input className="input" type="password" dir="ltr" autoComplete="new-password" required minLength={10} placeholder={t('passwordHint')} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <p className="error">{error}</p>}
          <button className="btn primary">{t('save')}</button>
        </form>
      </Card>
    </main>
  );
}
