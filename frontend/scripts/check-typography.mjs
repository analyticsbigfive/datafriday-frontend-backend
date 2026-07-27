#!/usr/bin/env node
/**
 * check-typography.mjs — garde-fou de la charte graphique (docs/CHARTE_GRAPHIQUE.md, ADR-0003).
 *
 * Vérifie deux règles OBJECTIVES de la charte :
 *   • font-size : en `rem` uniquement, et dans les 7 paliers autorisés (jamais en px).
 *   • font-weight : dans {400, 500, 600, 700} (jamais 650/750/800/bolder…).
 *
 * Les `var(--fs-*)` / `var(--fw-*)` (tokens de la charte) sont conformes par construction.
 * Zéro dépendance : Node pur, aucun `pnpm install` requis.
 *
 * Usage :
 *   node scripts/check-typography.mjs               # défaut : lignes AJOUTÉES au diff git
 *   node scripts/check-typography.mjs --changed     # idem, explicite
 *   node scripts/check-typography.mjs --all          # scan complet de src/ (bruyant : legacy)
 *   node scripts/check-typography.mjs <fichiers...>  # scan complet des fichiers donnés
 *
 * Le mode par défaut (diff) applique la charte au NOUVEAU code sans toucher l'existant
 * (migration « opportuniste » — charte §5). Sort en code 1 s'il reste des violations.
 */
import { execSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Paliers autorisés (rem) — miroir exact de src/style.css (:root) et de la charte §3.
const ALLOWED_REM = new Set([0.6875, 0.75, 0.8125, 0.875, 1, 1.25, 1.5])
const ALLOWED_WEIGHTS = new Set(['400', '500', '600', '700', 'normal', 'bold'])

// Palier le plus proche, pour suggérer une correction lisible.
const PALIERS = [
  ['--fs-xs', 0.6875], ['--fs-sm', 0.75], ['--fs-base', 0.8125],
  ['--fs-md', 0.875], ['--fs-lg', 1], ['--fs-xl', 1.25], ['--fs-xxl', 1.5],
]
const WEIGHT_TOKEN = { 400: '--fw-regular', 500: '--fw-medium', 600: '--fw-semibold', 700: '--fw-bold' }

function nearestSize(rem) {
  let best = PALIERS[0]
  for (const p of PALIERS) if (Math.abs(p[1] - rem) < Math.abs(best[1] - rem)) best = p
  return `var(${best[0]}) (${best[1]}rem)`
}
function nearestWeight(n) {
  const opts = [400, 500, 600, 700]
  const w = opts.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a))
  return `var(${WEIGHT_TOKEN[w]}) (${w})`
}

/** Analyse une ligne CSS ; renvoie la liste des violations (0, 1 ou plusieurs).
    Une même ligne peut porter plusieurs déclarations (styles inline multi-props)
    et cumuler une faute de taille ET de poids → on les remonte toutes. */
function checkLine(line) {
  const t = line.trim()
  if (t.startsWith('*') || t.startsWith('//')) return []
  const msgs = []

  // font-size (toutes les occurrences de la ligne)
  for (const fs of line.matchAll(/font-size\s*:\s*([^;{}!]+)/gi)) {
    const val = fs[1].trim().toLowerCase()
    if (/var\(|inherit|initial|unset|calc\(|clamp\(|\bem\b|%|^0\b/.test(val)) continue
    const px = /(-?\d*\.?\d+)px/.exec(val)
    if (px) { msgs.push(`font-size en px interdit (${px[0]}) → ${nearestSize(parseFloat(px[1]) / 16)}`); continue }
    const rem = /(-?\d*\.?\d+)rem/.exec(val)
    if (rem && !ALLOWED_REM.has(parseFloat(rem[1]))) {
      msgs.push(`font-size hors des 7 paliers (${rem[0]}) → ${nearestSize(parseFloat(rem[1]))}`)
    }
  }

  // font-weight (toutes les occurrences de la ligne)
  for (const fw of line.matchAll(/font-weight\s*:\s*([^;{}!]+)/gi)) {
    const val = fw[1].trim().toLowerCase()
    if (/var\(|inherit|initial|unset/.test(val)) continue
    const num = /^(\d+)$/.exec(val)
    if (num) {
      if (!ALLOWED_WEIGHTS.has(num[1])) msgs.push(`font-weight hors charte (${num[1]}) → ${nearestWeight(+num[1])}`)
    } else if (!ALLOWED_WEIGHTS.has(val)) {
      msgs.push(`font-weight hors charte (${val}) → un des 4 poids (var(--fw-*))`)
    }
  }
  return msgs
}

/** Mode diff : ne remonte que les lignes AJOUTÉES (staged + unstaged). */
function scanDiff() {
  const violations = []
  let out = ''
  try {
    out = execSync('git diff -U0 --no-color HEAD -- "*.vue" "*.css"', { encoding: 'utf8', cwd: process.cwd() })
  } catch { return violations }
  let file = null, newLine = 0
  for (const line of out.split('\n')) {
    const fm = /^\+\+\+ b\/(.+)$/.exec(line)
    if (fm) { file = fm[1]; continue }
    const hm = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hm) { newLine = parseInt(hm[1], 10); continue }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      if (file) for (const msg of checkLine(line.slice(1))) violations.push({ file, line: newLine, msg })
      newLine++
    } else if (!line.startsWith('-') && !line.startsWith('\\')) {
      newLine++
    }
  }
  return violations
}

/** Mode fichiers : scan intégral. */
function scanFiles(files) {
  const violations = []
  for (const f of files) {
    if (!existsSync(f)) continue
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((l, i) => { for (const m of checkLine(l)) violations.push({ file: f, line: i + 1, msg: m }) })
  }
  return violations
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else if (/\.(vue|css)$/.test(name)) acc.push(p)
  }
  return acc
}

// ── Entrée ──
const args = process.argv.slice(2)
let violations
if (args.includes('--all')) violations = scanFiles(walk('src'))
else if (args.length && !args[0].startsWith('--')) violations = scanFiles(args)
else violations = scanDiff()

if (!violations.length) {
  console.log('✓ Typographie conforme à la charte (docs/CHARTE_GRAPHIQUE.md).')
  process.exit(0)
}
console.error(`✗ ${violations.length} violation(s) de la charte typographique :\n`)
for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.msg}`)
console.error('\nCharte : docs/CHARTE_GRAPHIQUE.md · tokens : src/style.css (:root)')
process.exit(1)
