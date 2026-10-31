'use client';
import { CSSProperties } from 'react';
import { translate } from '@/lib/dict';
import { AdContent } from './AdFields';

export type PagePosition = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center' | 'bottom_full';
export type PageType = 'front' | 'inner' | 'back';

interface Props { ad: AdContent; widthCm: number; heightCm: number; pageWidthCm: number; pageHeightCm: number; pageColumns: number; position: PagePosition; pageType: PageType; colour: boolean }

const MARGIN = 3; // percent of the page kept clear at each edge

export function NewspaperPreview({ ad, widthCm, heightCm, pageWidthCm, pageHeightCm, pageColumns, position, pageType, colour }: Props) {
  const bodyWidth = 100 - MARGIN * 2;
  const w = Math.min(((widthCm || 0) / (pageWidthCm || 1)) * 100, bodyWidth);
  const hasMasthead = pageType === 'front';
  const topLimit = hasMasthead ? 17 : 6;
  const h = Math.min(((heightCm || 0) / (pageHeightCm || 1)) * 100, 100 - topLimit - MARGIN);

  const fullStrip = position === 'bottom_full';
  const box: CSSProperties = { width: `${fullStrip ? bodyWidth : w}%`, height: `${h}%` };
  if (position === 'center') { box.left = `${50 - w / 2}%`; box.top = `${(topLimit + 100 - MARGIN - h) / 2}%`; }
  else {
    box[position.endsWith('right') ? 'right' : 'left'] = `${MARGIN}%`;
    box[position.startsWith('top') ? 'top' : 'bottom'] = position.startsWith('top') ? `${topLimit}%` : `${MARGIN}%`;
  }
  const dir = ad.lang === 'ur' ? 'rtl' : 'ltr';

  return (
    <div className="paper" dir={dir} lang={ad.lang} style={{ aspectRatio: `${pageWidthCm || 33} / ${pageHeightCm || 54}` }}>
      {hasMasthead && (
        <header className="paper-mast">
          <h3>{translate(ad.lang, 'paperName')}</h3>
          <div className="paper-rule" />
        </header>
      )}
      <div className="paper-cols" style={{ top: `${topLimit}%`, columnCount: Math.max(pageColumns || 1, 1) }}>
        {Array.from({ length: Math.max(pageColumns || 1, 1) * 6 }, (_, i) => (
          <div key={i} className="paper-story"><i /><p /></div>
        ))}
      </div>
      <div className={`paper-ad${colour ? '' : ' mono'}`} style={box}>
        {ad.artwork
          ? <img src={ad.artwork} alt="" />
          : <div><b>{ad.heading}</b><span>{ad.body}</span></div>}
      </div>
    </div>
  );
}
