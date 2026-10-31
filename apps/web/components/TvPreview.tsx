'use client';
import { translate } from '@/lib/dict';
import { AdContent } from './AdFields';

export type TvFormat = 'tvc' | 'ticker' | 'breaking_ticker' | 'lower_third' | 'l_shape' | 'logo_placement' | 'sponsorship' | 'scroll';

function Marquee({ text, rtl, seconds }: { text: string; rtl: boolean; seconds: number }) {
  return (
    <div className="tv-marquee">
      <span className={rtl ? 'run-rtl' : 'run-ltr'} style={{ animationDuration: `${seconds}s` }}>{text}</span>
    </div>
  );
}

const Mark = ({ ad }: { ad: AdContent }) => ad.artwork ? <img src={ad.artwork} alt="" /> : <b>{ad.heading}</b>;

function Program({ lang }: { lang: AdContent['lang'] }) {
  return (
    <div className="tv-scene">
      <div className="tv-anchor" />
      <div className="tv-live">{translate(lang, 'anchorLive')}</div>
      <div className="tv-channel">{translate(lang, 'channelName')}</div>
      <div className="tv-strap">{translate(lang, 'headlineFiller')}</div>
    </div>
  );
}

export function TvPreview({ format, ad, durationSeconds }: { format: TvFormat; ad: AdContent; durationSeconds: number }) {
  const rtl = ad.lang === 'ur';
  const tr = (k: Parameters<typeof translate>[1]) => translate(ad.lang, k);
  const line = `${ad.heading} • ${ad.body}`;

  // The key restarts animations whenever the content changes.
  return (
    <div className={`tv ${format}`} dir={rtl ? 'rtl' : 'ltr'} lang={ad.lang} key={`${format}-${durationSeconds}-${ad.lang}`}>
      {format === 'tvc' && (
        <div className="tv-full">
          <span className="tv-badge">{tr('adBadge')} · {durationSeconds || 0}s</span>
          {ad.artwork ? <img src={ad.artwork} alt="" /> : <div><b>{ad.heading}</b><span>{ad.body}</span></div>}
          <i className="tv-progress" style={{ animationDuration: `${Math.max(durationSeconds, 1)}s` }} />
        </div>
      )}
      {format === 'sponsorship' && (
        <div className="tv-full">
          <div><span>{tr('sponsoredBy')}</span><Mark ad={ad} /></div>
        </div>
      )}
      {format === 'l_shape' && (
        <>
          <div className="tv-l-video"><Program lang={ad.lang} /></div>
          <div className="tv-l-side"><Mark ad={ad} /></div>
          <div className="tv-l-bottom">{ad.body}</div>
        </>
      )}
      {!['tvc', 'sponsorship', 'l_shape'].includes(format) && <Program lang={ad.lang} />}
      {format === 'ticker' && <div className="tv-bar"><Marquee text={line} rtl={rtl} seconds={16} /></div>}
      {format === 'scroll' && <div className="tv-bar top"><Marquee text={line} rtl={rtl} seconds={20} /></div>}
      {format === 'breaking_ticker' && (
        <div className="tv-bar red"><em>{tr('breaking')}</em><Marquee text={line} rtl={rtl} seconds={12} /></div>
      )}
      {format === 'lower_third' && (
        <div className="tv-third"><div className="tv-third-mark"><Mark ad={ad} /></div><span>{ad.body}</span></div>
      )}
      {format === 'logo_placement' && <div className="tv-bug"><Mark ad={ad} /></div>}
    </div>
  );
}
