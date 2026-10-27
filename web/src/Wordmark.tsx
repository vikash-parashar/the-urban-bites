import { brand } from './brand'

// The logo lettering from the hero video: a script "The", a tall glowing "URBAN" and a gold script "Bites".
// Words come from brand.json, so a rename still works.
export default function Wordmark() {
  return (
    <span className="wordmark" aria-label={brand.name} role="img">
      <span className="wm-stack" aria-hidden="true">
        <i className="wm-the">{brand.lead}</i>
        <b className="wm-urban">{brand.main.toUpperCase()}</b>
      </span>
      <em className="wm-bites" aria-hidden="true">{brand.accent}</em>
    </span>
  )
}
