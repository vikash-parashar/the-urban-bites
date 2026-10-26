export const M = (p: string) => `media/${p}`
export const D = (p: string) => `media/dishes/${p}.jpg`

export type Dish = { id: string; name: string; hi?: string; full: number | null; half?: number; img: string; cat: string; tag?: string; veg: true; note: string }

export const dishes: Dish[] = [
  { id: 'momos', name: 'Momos', hi: 'मोमोज', full: 70, img: D('momos'), cat: 'Snacks', tag: 'Bestseller', veg: true, note: 'Steamed, with fiery red chutney' },
  { id: 'paneer-tikka', name: 'Paneer Tikka', hi: 'पनीर टिक्का', full: 250, half: 170, img: D('paneer-tikka'), cat: 'Tandoor', tag: 'Chef’s pick', veg: true, note: 'Charred in the tandoor, smoky masala' },
  { id: 'gravy-chaap', name: 'Gravy Chaap', hi: 'ग्रेवी चाप', full: 220, half: 150, img: D('chaap'), cat: 'Mains', veg: true, note: 'Soya chaap in rich onion-tomato gravy' },
  { id: 'malai-chaap', name: 'Malai Chaap', hi: 'मलाई चाप', full: 230, half: 160, img: D('chaap'), cat: 'Tandoor', tag: 'Creamy', veg: true, note: 'Cream and cashew marinade, slow roasted' },
  { id: 'paneer-chilli', name: 'Paneer Chilli', hi: 'पनीर चिल्ली', full: 270, img: D('chilli-paneer'), cat: 'Chinese', tag: 'Spicy', veg: true, note: 'Wok-tossed with peppers and onion' },
  { id: 'matar-paneer', name: 'Matar Paneer', hi: 'मटर पनीर', full: 240, half: 160, img: D('kadhai-paneer'), cat: 'Mains', veg: true, note: 'Home-style peas and paneer curry' },
  { id: 'finger-chilli', name: 'Finger Chilli', hi: 'फिंगर चिल्ली', full: 160, img: D('honey-chilli'), cat: 'Chinese', veg: true, note: 'Crispy potato in sweet chilli glaze' },
  { id: 'finger-chips', name: 'Finger Chips', hi: 'फिंगर चिप्स', full: 90, img: D('fries'), cat: 'Snacks', veg: true, note: 'Golden fries with peri-peri dust' },
  { id: 'corn-masala', name: 'Sweet Corn Masala', hi: 'स्वीट कॉर्न', full: 100, img: D('peanut-masala'), cat: 'Snacks', veg: true, note: 'Buttery corn, lemon and chaat masala' },
  { id: 'chana-masala', name: 'Chana Masala', hi: 'चना मसाला', full: 80, img: D('chana-masala'), cat: 'Mains', veg: true, note: 'Punjabi chole, slow cooked' },
  { id: 'garlic-naan', name: 'Garlic Naan', hi: 'गार्लिक नान', full: 70, img: D('naan'), cat: 'Breads', veg: true, note: 'Fresh from the tandoor, garlic butter' },
  { id: 'paratha', name: 'Tandoori Paratha', hi: 'तंदूरी परांठा', full: 60, img: D('paratha'), cat: 'Breads', veg: true, note: 'Layered and crisp' },
  { id: 'cold-coffee', name: 'Cold Coffee', hi: 'कोल्ड कॉफ़ी', full: 80, img: D('cold-coffee'), cat: 'Drinks', veg: true, note: 'Thick, chilled, frothy' },
  { id: 'chai', name: 'Shakkar Wali Chai', hi: 'शक्कर वाली चाय', full: null, img: D('chai'), cat: 'Drinks', tag: 'Local favourite', veg: true, note: 'Kadak chai, sweetened with shakkar' },
]
export const cats = ['All', 'Snacks', 'Tandoor', 'Chinese', 'Mains', 'Breads', 'Drinks']
export const rupee = (n: number | null) => (n == null ? 'Ask at counter' : `₹${n}`)

export const biz = {
  name: 'The Urban Bites',
  motto: 'स्वाद, सफ़ाई और गुणवत्ता में द अर्बन बाइट्स का कोई मुकाबला नहीं',
  phone: '8398907216',
  place: 'Julana Bypass, near Brahmanwas, Haryana',
  hours: 'Open daily, 11 AM – 11 PM',
  maps: 'https://www.google.com/maps/dir/?api=1&destination=29.113493,76.416352',
  offer: { title: 'Free delivery within 5 km', sub: 'On every order above ₹500' },
}
export const promises = [
  { k: 'स्वाद', t: 'Taste', d: 'Masalas ground fresh every morning. Nothing from a packet.' },
  { k: 'सफ़ाई', t: 'Cleanliness', d: 'Gloves on, counter wiped after every order, RO water only.' },
  { k: 'गुणवत्ता', t: 'Quality', d: 'Fresh paneer daily, refined oil changed every day.' },
]
export const regulars = [
  { n: 'Rohit S.', v: 42 }, { n: 'Pooja K.', v: 35 }, { n: 'Aman D.', v: 29 },
]
export const photos = [M('night-huts.jpg'), M('counter.jpg'), M('wok.jpg'), M('hut.jpg'), M('shed-trees.jpg'), M('menu-board.jpg'), M('night-huts-2.jpg'), M('banner.jpg')]
