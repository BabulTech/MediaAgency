'use client';
import { FormEvent, useState } from 'react';
import { Card, Field } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const { t, toggleLang } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error: failed } = await supabase.auth.signInWithPassword({ email, password });
    if (failed) { setError(t('badLogin')); setBusy(false); return; }
    const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (level?.nextLevel === 'aal2' && level.currentLevel !== 'aal2') { setNeedCode(true); setBusy(false); return; }
    window.location.href = '/dashboard';
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp[0];
    if (!factor) return;
    const { error: failed } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (failed) { setError(t('badCode')); return; }
    window.location.href = '/dashboard';
  }

  async function forgot() {
    setError(''); setNotice('');
    if (!email) { setError(t('enterEmail')); return; }
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setNotice(t('resetSent')); // same message either way, so account existence is not revealed
  }

  return (
    <main className="login">
      <Card title={t('appName')}>
        {needCode ? <form className="stack" onSubmit={verify}>
          <Field label={t('mfaCode')}><input className="input" dir="ltr" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          {error && <p className="error">{error}</p>}
          <button className="btn primary">{t('login')}</button>
        </form> : <form className="stack" onSubmit={submit}>
          <Field label={t('email')}><input className="input" type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label={t('password')}><input className="input" type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <p className="error">{error}</p>}
          {notice && <p className="muted">{notice}</p>}
          <button className="btn primary" disabled={busy}>{t('login')}</button>
          <button type="button" className="btn" onClick={forgot}>{t('forgotPassword')}</button>
          <button type="button" className="btn" onClick={toggleLang}>{t('language')}</button>
        </form>}
      </Card>
    </main>
  );
}
