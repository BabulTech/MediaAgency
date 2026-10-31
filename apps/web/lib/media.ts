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
