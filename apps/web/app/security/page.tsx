'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Card, Field } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function SecurityPage() {
  const { t } = useI18n();
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [factor, setFactor] = useState<{ id: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { supabase.auth.mfa.listFactors().then(({ data }) => setEnrolled(!!data?.totp.length)); }, []);

  async function start() {
    setError('');
    const { data, error: failed } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (failed || !data) { setError(t('saveFailed')); return; }
    setFactor({ id: data.id, qr: data.totp.qr_code });
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!factor) return;
    const { error: failed } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (failed) { setError(t('badCode')); return; }
    setEnrolled(true); setFactor(null);
  }

  return (
    <div className="stack">
      <h1>{t('security')}</h1>
      <Card title={t('mfa')}>
        {enrolled && <p>{t('mfaOn')}</p>}
        {enrolled === false && !factor && <button type="button" className="btn primary" onClick={start}>{t('mfaEnable')}</button>}
        {factor && (
          <form className="stack" onSubmit={confirm}>
            <p className="muted">{t('mfaScan')}</p>
            <img src={factor.qr} alt="" width={200} height={200} style={{ background: '#fff' }} />
            <Field label={t('mfaCode')}><input className="input" dir="ltr" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} /></Field>
            <button className="btn primary">{t('save')}</button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </Card>
    </div>
  );
}
