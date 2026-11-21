// Picks a readable text colour for any brand accent a workspace owner chooses,
// so a light accent (yellow, mint) gets dark text instead of invisible white.

const channel = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const full = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

const DARK_INK = '#0b1224'
const LIGHT_INK = '#ffffff'

/** White or near-black, whichever has the higher contrast on `background`. */
export function readableInk(background: string | null | undefined): string {
  const l = background ? luminance(background) : null
  if (l === null) return LIGHT_INK
  const onWhite = 1.05 / (l + 0.05)
  const onDark = (l + 0.05) / ((luminance(DARK_INK) ?? 0) + 0.05)
  return onWhite >= onDark ? LIGHT_INK : DARK_INK
}
