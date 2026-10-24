import data from '../../seed/menu.json'

export type Size = 'full' | 'half'

export interface MenuItem {
  id: string
  name: string
  name_hi: string
  full: number | null
  half?: number
  image: string
  offer_price?: number
}

export interface Category {
  id: string
  name: string
  name_hi: string
  items: MenuItem[]
}

export const business = data.business
export const categories = data.categories as Category[]

export const media = (path: string) => `${import.meta.env.BASE_URL}media/${path}`
export const dishImage = (key: string) => media(`dishes/${key}.jpg`)

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`
