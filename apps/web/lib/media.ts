export const PAPER_FORMATS = ['display', 'classified', 'tender', 'public_notice'] as const;
export const TV_FORMATS = ['tvc', 'ticker', 'breaking_ticker', 'lower_third', 'l_shape', 'logo_placement', 'sponsorship', 'scroll'] as const;
export const OTHER_FORMATS = {
  radio: ['radio_spot', 'rj_mention', 'radio_sponsorship', 'jingle', 'live_read'],
  digital: ['website_banner', 'sponsored_article', 'homepage_takeover', 'native_ad', 'newsletter_sponsorship', 'video_preroll'],
  social: ['social_campaign'],
  outdoor: ['billboard', 'digital_screen', 'transit_ad'],
} as const;
export type OtherKind = keyof typeof OTHER_FORMATS;
export const MEDIA_UNITS = {
  radio: ['per_second', 'per_spot', 'fixed'],
  digital: ['per_cpm', 'per_cpc', 'per_cpv', 'per_day', 'fixed'],
  social: ['per_cpm', 'per_cpc', 'per_cpv', 'fixed'],
  outdoor: ['per_month', 'per_week', 'per_day', 'fixed'],
} as const;
export const TIME_BANDS = ['morning', 'afternoon', 'evening', 'prime', 'late', 'special'] as const;

/** One ad as a calculator reports it to the order form. */
export interface AdDraft {
  outletId: string; outletName: string; formatCode: string; timeBandCode?: string; unit: string; rate: number; multiplier?: number; premiumFixed?: number; surchargePercent?: number; discountPercent?: number;
  quantity: Record<string, number>; ad?: { heading: string; body: string; lang: string }; total: string | null;
}

/** Common sizes on a 33 x 53 cm, 8-column broadsheet. Each paper's own media kit has the final dimensions. */
export const AD_SIZES = [
  { code: 'full', label: 'Full page (33 x 53 cm)', widthCm: 33, heightCm: 53, columns: 8 },
  { code: 'half_h', label: 'Half page wide (33 x 26 cm)', widthCm: 33, heightCm: 26, columns: 8 },
  { code: 'half_v', label: 'Half page tall (16 x 53 cm)', widthCm: 16, heightCm: 53, columns: 4 },
  { code: 'quarter', label: 'Quarter page (16 x 26 cm)', widthCm: 16, heightCm: 26, columns: 4 },
  { code: 'eighth', label: 'Eighth page (16 x 13 cm)', widthCm: 16, heightCm: 13, columns: 4 },
  { code: 'strip', label: 'Bottom strip (33 x 10 cm)', widthCm: 33, heightCm: 10, columns: 8 },
  { code: 'c2x10', label: '2 columns x 10 cm', widthCm: 8, heightCm: 10, columns: 2 },
  { code: 'c3x15', label: '3 columns x 15 cm', widthCm: 12, heightCm: 15, columns: 3 },
  { code: 'c4x20', label: '4 columns x 20 cm', widthCm: 16, heightCm: 20, columns: 4 },
  { code: 'ear', label: 'Ear panel (6 x 5 cm)', widthCm: 6, heightCm: 5, columns: 1 },
] as const;
export const TV_DURATIONS = [5, 10, 15, 20, 30, 45, 60] as const;
