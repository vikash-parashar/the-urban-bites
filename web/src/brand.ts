// The business name, motto and logo, from web/brand.json. Rename the site by editing that file.
import b from '../brand.json'

export const brand = {
  ...b,
  logoUrl: `${import.meta.env.BASE_URL}${b.logo}`,
  upper: b.name.toUpperCase(),
}
