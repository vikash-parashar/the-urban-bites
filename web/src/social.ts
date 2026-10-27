import { brand } from './brand'

// The cart's pages elsewhere (from Vikash, 2026-10-27). Build-time overrides: VITE_INSTAGRAM_URL, VITE_FACEBOOK_URL, VITE_GOOGLE_REVIEW_URL.
const env = import.meta.env

export const social = {
  instagram: (env.VITE_INSTAGRAM_URL as string | undefined) || 'https://www.instagram.com/the_urban_bites._/',
  facebook: (env.VITE_FACEBOOK_URL as string | undefined) || 'https://www.facebook.com/masoom.sharma.phan.p',
  // The "write a review" link from the Google Business Profile (g.page/r/…/review).
  googleReview: (env.VITE_GOOGLE_REVIEW_URL as string | undefined) || 'https://g.page/r/CRzjIrqC1I_yEBM/review',
  whatsapp: `https://wa.me/91${brand.phone}?text=` + encodeURIComponent(`Hi ${brand.name}! I want to order: `),
}

// Until the Google listing is live, this opens a Maps search for the cart.
export const googleMaps = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

// Who built the site, shown in the footer with a lead link. VITE_DEV_CONTACT_URL can point to the agency website later.
export const developer = {
  name: 'Vikash Parashar',
  company: 'Ampli Digital World',
  contact: (env.VITE_DEV_CONTACT_URL as string | undefined) ||
    `mailto:gowithvikash@gmail.com?subject=${encodeURIComponent('Website like The Urban Bites')}&body=${encodeURIComponent('Hi Vikash, I saw theurbanbites.in and want a website for my business.\n\nName:\nBusiness:\nPhone:')}`,
}
