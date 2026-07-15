// Formes SVG partagées Plan 2D (source unique : PlanCanvas, PlanElement).

/**
 * Path d'un rectangle à coins arrondis PAR COIN (px). radius = {topLeft, topRight,
 * bottomRight, bottomLeft} en px (déjà convertis). Retombe sur un rectangle simple
 * si tous les rayons sont nuls.
 */
export function roundedRectPath(x, y, w, h, radius = {}) {
  const cap = (v) => Math.max(0, Math.min(v || 0, w / 2, h / 2))
  const tl = cap(radius.topLeft)
  const tr = cap(radius.topRight)
  const br = cap(radius.bottomRight)
  const bl = cap(radius.bottomLeft)
  if (!tl && !tr && !br && !bl) {
    return `M ${x} ${y} h ${w} v ${h} h ${-w} Z`
  }
  return [
    `M ${x + tl} ${y}`,
    `H ${x + w - tr}`, tr ? `Q ${x + w} ${y} ${x + w} ${y + tr}` : '',
    `V ${y + h - br}`, br ? `Q ${x + w} ${y + h} ${x + w - br} ${y + h}` : '',
    `H ${x + bl}`, bl ? `Q ${x} ${y + h} ${x} ${y + h - bl}` : '',
    `V ${y + tl}`, tl ? `Q ${x} ${y} ${x + tl} ${y}` : '',
    'Z',
  ].filter(Boolean).join(' ')
}

/** Convertit un cornerRadius en mètres vers px. */
export function radiusToPx(cornerRadius, pxPerMeter) {
  const r = cornerRadius || {}
  return {
    topLeft: (r.topLeft || 0) * pxPerMeter,
    topRight: (r.topRight || 0) * pxPerMeter,
    bottomRight: (r.bottomRight || 0) * pxPerMeter,
    bottomLeft: (r.bottomLeft || 0) * pxPerMeter,
  }
}
