// Projection isométrique — fonctions PURES, reprises de la v1 (ElevationBuilderView)
// et extraites ici pour être testables (doc REFONTE_3D_BUILDER_V2 §5 : « conservé v1 »).
// Monde en mètres → coordonnées SVG. Aucune dépendance Vue.

export const ISO_SCALE = 3 // px par mètre (même valeur que la v1)

export function rotatePoint(x, y, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: x * Math.cos(rad) - y * Math.sin(rad),
    y: x * Math.sin(rad) + y * Math.cos(rad),
  }
}

/** Projection iso 2:1 identique à la v1 : rotation autour de Z puis aplatissement. */
export function toIso(x, y, z, angleDeg, scale = ISO_SCALE) {
  const r = rotatePoint(x * scale, y * scale, angleDeg)
  return {
    x: r.x - r.y,
    y: (r.x + r.y) * 0.5 - z * scale,
  }
}

function toPath(points) {
  return `M ${points.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')} Z`
}

// ── Helpers coins arrondis ────────────────────────────────────────────────────

function isZeroRadius(r) {
  return !r || (
    (r.topLeft || 0) === 0 &&
    (r.topRight || 0) === 0 &&
    (r.bottomRight || 0) === 0 &&
    (r.bottomLeft || 0) === 0
  )
}

const ARC_SEGS = 8

/**
 * Génère les points d'un rectangle arrondi en coordonnées monde [x, y][].
 * Les coins sans rayon produisent un seul point ; les coins arrondis génèrent un arc.
 */
function roundedCorners(x, y, width, depth, r) {
  const tl = Math.min(r.topLeft || 0, width / 2, depth / 2)
  const tr = Math.min(r.topRight || 0, width / 2, depth / 2)
  const br = Math.min(r.bottomRight || 0, width / 2, depth / 2)
  const bl = Math.min(r.bottomLeft || 0, width / 2, depth / 2)
  const pts = []

  if (tl > 0) {
    for (let i = 0; i <= ARC_SEGS; i++) {
      const a = (Math.PI / 2) * (i / ARC_SEGS)
      pts.push([x + tl - tl * Math.cos(a), y + tl - tl * Math.sin(a)])
    }
  } else {
    pts.push([x, y])
  }
  if (tr > 0) {
    for (let i = 0; i <= ARC_SEGS; i++) {
      const a = (Math.PI / 2) * (i / ARC_SEGS)
      pts.push([x + width - tr + tr * Math.sin(a), y + tr - tr * Math.cos(a)])
    }
  } else {
    pts.push([x + width, y])
  }
  if (br > 0) {
    for (let i = 0; i <= ARC_SEGS; i++) {
      const a = (Math.PI / 2) * (i / ARC_SEGS)
      pts.push([x + width - br + br * Math.cos(a), y + depth - br + br * Math.sin(a)])
    }
  } else {
    pts.push([x + width, y + depth])
  }
  if (bl > 0) {
    for (let i = 0; i <= ARC_SEGS; i++) {
      const a = (Math.PI / 2) * (i / ARC_SEGS)
      pts.push([x + bl - bl * Math.sin(a), y + depth - bl + bl * Math.cos(a)])
    }
  } else {
    pts.push([x, y + depth])
  }

  return pts
}

/**
 * Idem, mais les points sont pivotés d'un angle `rotDeg` autour du centre de l'élément.
 * Parité v1 drawRotatedRoundedBox.
 */
function rotatedRoundedCorners(x, y, width, depth, r, rotDeg) {
  const cx = x + width / 2
  const cy = y + depth / 2
  const rad = (rotDeg * Math.PI) / 180
  // Génère les arcs en repère local (coin TL = 0,0)
  return roundedCorners(0, 0, width, depth, r).map(([lx, ly]) => {
    const rx = lx - width / 2 // relatif au centre
    const ry = ly - depth / 2
    return [
      cx + rx * Math.cos(rad) - ry * Math.sin(rad),
      cy + rx * Math.sin(rad) + ry * Math.cos(rad),
    ]
  })
}

/**
 * Boîte 3D en iso → liste de faces à dessiner dans l'ordre (peintre) :
 * les 4 faces latérales triées de l'arrière vers l'avant, puis la face du dessus.
 * Chaque face : { d, part: 'side' | 'top' | 'bottom', fillRule? }.
 *
 * Options :
 * - `hole`         : { x, y, width, depth } — perce la face supérieure (trou d'atrium).
 * - `rotationDeg`  : rotation de l'élément autour de son centre (degrés).
 * - `cornerRadius` : { topLeft, topRight, bottomRight, bottomLeft } (mètres).
 *   Quand présent, renvoie seulement face basse + face haute arrondies — parité v1
 *   drawRoundedBox / drawRotatedRoundedBox (pas de faces latérales sur les boîtes
 *   arrondies, identique au comportement v1).
 */
export function boxFaces({
  x, y, z,
  width, depth, height,
  angleDeg,
  scale = ISO_SCALE,
  hole = null,
  rotationDeg = 0,
  cornerRadius = null,
}) {
  const hasRadius = !isZeroRadius(cornerRadius)
  const isRotated = (rotationDeg % 360) !== 0

  // ── Boîte arrondie : face basse + face haute seulement (parité v1) ───────────
  if (hasRadius) {
    const pts = isRotated
      ? rotatedRoundedCorners(x, y, width, depth, cornerRadius, rotationDeg)
      : roundedCorners(x, y, width, depth, cornerRadius)
    const bottom = pts.map(([px, py]) => toIso(px, py, z, angleDeg, scale))
    const top = pts.map(([px, py]) => toIso(px, py, z + height, angleDeg, scale))
    return [
      { part: 'bottom', d: toPath(bottom), depthKey: -Infinity },
      { part: 'top', d: toPath(top), depthKey: Infinity },
    ]
  }

  // ── Boîte standard (éventuellement pivotée) ──────────────────────────────────
  let corners
  if (isRotated) {
    const cx = x + width / 2
    const cy = y + depth / 2
    const rad = (rotationDeg * Math.PI) / 180
    corners = [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2],
    ].map(([lx, ly]) => [
      cx + lx * Math.cos(rad) - ly * Math.sin(rad),
      cy + lx * Math.sin(rad) + ly * Math.cos(rad),
    ])
  } else {
    corners = [
      [x, y],
      [x + width, y],
      [x + width, y + depth],
      [x, y + depth],
    ]
  }

  const bottom = corners.map(([px, py]) => toIso(px, py, z, angleDeg, scale))
  const top = corners.map(([px, py]) => toIso(px, py, z + height, angleDeg, scale))

  const sides = [0, 1, 2, 3].map((i) => {
    const j = (i + 1) % 4
    return {
      part: 'side',
      d: toPath([bottom[i], bottom[j], top[j], top[i]]),
      depthKey: (bottom[i].y + bottom[j].y) / 2,
    }
  })
  sides.sort((a, b) => a.depthKey - b.depthKey)

  let topFace = { part: 'top', d: toPath(top), depthKey: Infinity }
  if (hole && hole.width > 0 && hole.depth > 0) {
    const holePts = [
      [hole.x, hole.y],
      [hole.x + hole.width, hole.y],
      [hole.x + hole.width, hole.y + hole.depth],
      [hole.x, hole.y + hole.depth],
    ].map(([px, py]) => toIso(px, py, z + height, angleDeg, scale))
    topFace = { ...topFace, d: `${topFace.d} ${toPath(holePts)}`, fillRule: 'evenodd' }
  }

  return [...sides, topFace]
}

/**
 * Contient un élément dans les bornes de sa zone — présentation SEULE, les
 * coordonnées stockées ne sont pas réécrites (données héritées de la migration v1
 * ou zone rétrécie après coup). Retourne { x, y, width, depth } clampés.
 * Partagé Plan 2D / vue iso : aucun élément ne se dessine hors de sa plaque.
 */
export function containElementInZone(element, zone) {
  const width = Math.min(element.width || 0, zone.width || 0)
  const depth = Math.min(element.depth || 0, zone.length || 0)
  return {
    width,
    depth,
    x: Math.min(Math.max(element.x || 0, 0), (zone.width || 0) - width),
    y: Math.min(Math.max(element.y || 0, 0), (zone.length || 0) - depth),
  }
}

/**
 * Altitude (z, en mètres) du plancher d'une zone FLOOR : somme des hauteurs des
 * étages de niveau inférieur (même règle que la v1). Les autres kinds sont au sol.
 */
export function zoneBaseZ(zone, allZones) {
  if (zone.kind !== 'FLOOR') return 0
  return allZones
    .filter((z) => z.kind === 'FLOOR' && z.level < zone.level)
    .reduce((sum, z) => sum + (z.height || 0), 0)
}

/**
 * Décalage (dx, dy — mètres monde, l'appelant centre ensuite la zone dessus) des
 * zones hors-étage autour de la pile d'étages : parvis à GAUCHE, espace externe à
 * DROITE, au sol. Deux règles de placement par défaut :
 *  - écart constant entre BORDS : le bord intérieur de la zone est à `gap` du bord
 *    de la pile, quelle que soit sa largeur (l'ancien calcul utilisait la largeur
 *    de la zone elle-même → chevauchement si zone étroite, trou si zone large) ;
 *  - façades alignées : le bord avant (y max) est aligné sur celui de la pile —
 *    tout repose sur la même ligne de sol en iso au lieu d'être centré en profondeur.
 * Plusieurs zones d'un même kind se rangent côte à côte vers l'extérieur.
 * S'y ajoute l'offset de présentation `geometry.isoOffset` ({ dx, dy } en mètres),
 * posé par drag dans la vue iso et persisté sur la Zone.
 */
export function zoneOffset(zone, allZones, gap = 12) {
  const iso = zone.geometry?.isoOffset
  const dxUser = Number(iso?.dx) || 0
  const dyUser = Number(iso?.dy) || 0

  const side = { FORECOURT: -1, EXTERNAL: 1 }[zone.kind]
  if (!side) return { dx: dxUser, dy: dyUser } // FLOOR : dans la pile

  const floors = allZones.filter((z) => z.kind === 'FLOOR')
  const stackHalfWidth = Math.max(0, ...floors.map((z) => z.width || 0)) / 2
  const stackFrontY = Math.max(0, ...floors.map((z) => z.length || 0)) / 2

  const siblings = allZones.filter((z) => z.kind === zone.kind)
  const rank = Math.max(0, siblings.findIndex((z) => z.id === zone.id))
  const shift = siblings.slice(0, rank).reduce((sum, z) => sum + (z.width || 0) + gap, 0)

  return {
    dx: side * (stackHalfWidth + gap + (zone.width || 0) / 2 + shift) + dxUser,
    dy: stackFrontY - (zone.length || 0) / 2 + dyUser,
  }
}
