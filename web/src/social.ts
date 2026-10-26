import { brand } from './brand'

// The cart's pages elsewhere. Leave a link empty to hide its button; fill them in when Vikash
// sends the handles. Build-time overrides: VITE_INSTAGRAM_URL, VITE_FACEBOOK_URL, VITE_GOOGLE_REVIEW_URL.
const env = import.meta.env

export const social = {
  instagram: (env.VITE_INSTAGRAM_URL as string | undefined) ?? '',
  facebook: (env.VITE_FACEBOOK_URL as string | undefined) ?? '',
  // The "write a review" link from the Google Business Profile (g.page/r/…/review).
  googleReview: (env.VITE_GOOGLE_REVIEW_URL as string | undefined) || 'https://g.page/r/CRzjIrqC1I_yEBM/review',
  whatsapp: `https://wa.me/91${brand.phone}?text=` + encodeURIComponent(`Hi ${brand.name}! I want to order: `),
}

// Until the Google listing is live, this opens a Maps search for the cart.
export const googleMaps = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
