// Texte lisible sur une part : sombre sur couleur claire, blanc sinon (luminance).
export function textColorOn(hex) {
  const h = String(hex || '').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return '#0f172a'
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.62 ? '#0f172a' : '#ffffff'
}

// Donut : dessin manuel (arcs 2D), rendu synchrone → html2canvas capture net.
// showLabels → % écrits sur les parts (donut « fin » sans légende texte).
export function drawDonut(canvas, slices, showLabels = false) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const cx = canvas.width / 2
  const cy = canvas.height / 2
  const r = Math.min(cx, cy) - 6
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const total = slices.reduce((a, s) => a + (s.value || 0), 0) || 1
  let angle = -Math.PI / 2
  for (const slice of slices) {
    const span = ((slice.value || 0) / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, angle, angle + span)
    ctx.closePath()
    ctx.fillStyle = slice.color
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
    angle += span
  }
  // Trou central → anneau (donut).
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // % sur les parts assez grandes (≥ 4 %) pour rester lisible.
  if (showLabels) {
    const labelR = r * 0.79
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '700 22px sans-serif'
    let a = -Math.PI / 2
    for (const slice of slices) {
      const span = ((slice.value || 0) / total) * Math.PI * 2
      const pct = ((slice.value || 0) / total) * 100
      if (pct >= 4) {
        const mid = a + span / 2
        ctx.fillStyle = textColorOn(slice.color)
        ctx.fillText(slice.pctLabel, cx + Math.cos(mid) * labelR, cy + Math.sin(mid) * labelR)
      }
      a += span
    }
  }
}
