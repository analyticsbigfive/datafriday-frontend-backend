/**
 * oklchFallback — convertit les couleurs `oklch()` en `rgb()` dans un document
 * cloné, avant capture par html2canvas.
 *
 * Pourquoi : html2canvas 1.4.1 ne connaît que les espaces colorimétriques
 * historiques et jette « Attempting to parse an unsupported color function
 * "oklch" » dès qu'une valeur calculée en contient. Or `src/index.css` porte le
 * thème Tailwind v4, dont TOUS les tokens de couleur sont en oklch : n'importe
 * quel élément du document en hérite, y compris le document du Rapport J+1 qui
 * n'utilise pourtant que des hex.
 *
 * On ne touche donc PAS au CSS de l'application (ces tokens sont la charte) :
 * on neutralise la syntaxe uniquement dans le clone jetable que html2canvas
 * parcourt, via son hook `onclone`. La conversion est faite à la main plutôt
 * que déléguée au navigateur parce que `getComputedStyle` conserve `oklch()`
 * tel quel — c'est justement ce que html2canvas reçoit.
 */

/** Propriétés susceptibles de porter une couleur (gradients et ombres inclus). */
const COLOR_PROPERTIES = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'box-shadow',
  'fill',
  'stroke',
]

/** Transfert de gamme linéaire → sRGB. */
function gamma(x) {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(v * 255)))
}

/**
 * OKLCH → sRGB (via Oklab puis LMS), coefficients de la spec CSS Color 4.
 * @returns {string} `rgb(r, g, b)` ou `rgba(r, g, b, a)`
 */
export function oklchToRgb(l, c, h, alpha = 1) {
  const hRad = (h * Math.PI) / 180
  const a = c * Math.cos(hRad)
  const b = c * Math.sin(hRad)

  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  const r = gamma(4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube)
  const g = gamma(-1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube)
  const bl = gamma(-0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube)

  return alpha >= 1 ? `rgb(${r}, ${g}, ${bl})` : `rgba(${r}, ${g}, ${bl}, ${alpha})`
}

/** `63.7%` → 0.637 ; `0.637` → 0.637. `none` → 0 (mot-clé CSS Color 4). */
function toNumber(token, percentBase = 1) {
  if (!token || token === 'none') return 0
  const raw = String(token).trim()
  if (raw.endsWith('%')) return (parseFloat(raw) / 100) * percentBase
  return parseFloat(raw) || 0
}

/** Remplace chaque `oklch(...)` d'une valeur CSS par son équivalent `rgb()`. */
export function replaceOklch(value) {
  return String(value).replace(/oklch\(([^)]*)\)/gi, (match, args) => {
    // `oklch(L C H / A)` — l'alpha est optionnel et séparé par un slash.
    const [colorPart, alphaPart] = String(args).split('/')
    const parts = colorPart.trim().split(/[\s,]+/).filter(Boolean)
    if (parts.length < 3) return match
    const l = toNumber(parts[0])
    const c = toNumber(parts[1], 0.4)
    const h = toNumber(parts[2])
    const alpha = alphaPart === undefined ? 1 : toNumber(alphaPart)
    return oklchToRgb(l, c, h, alpha)
  })
}

/**
 * Réécrit en place toutes les couleurs oklch d'un document/élément cloné.
 * À brancher sur `html2canvas(..., { onclone })`.
 * @param {Document|HTMLElement} root
 */
export function sanitizeOklchColors(root) {
  if (!root) return
  const doc = root.ownerDocument || root
  const view = doc.defaultView || window
  const scope = root.documentElement || root
  // `scope` inclus : les tokens vivent sur :root, et une couleur héritée depuis
  // <html> ne serait vue nulle part ailleurs.
  const elements = [scope, ...scope.querySelectorAll('*')]

  for (const el of elements) {
    let computed
    try {
      computed = view.getComputedStyle(el)
    } catch (_) {
      continue
    }
    for (const prop of COLOR_PROPERTIES) {
      const value = computed.getPropertyValue(prop)
      if (!value || !value.includes('oklch')) continue
      el.style.setProperty(prop, replaceOklch(value))
    }
  }
}
