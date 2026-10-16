import QRCode from 'qrcode'
import { useI18n } from '@/i18n/useI18n'
import { posCashierUrl } from '@/composables/usePosPdvActions'

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** PdV imprimables : un PIN lisible et un slug de QR code. */
export function printablePdvs(pdvs, { startedOnly = true } = {}) {
  return pdvs.filter((p) => p.pin && p.qrSlug && (!startedOnly || p.status !== 'inactive'))
}

/** Page HTML d'impression : une fiche par PdV (nom, QR code, PIN). Textes déjà traduits. */
export function buildPinSheetHtml({ title, pinLabel, cards }) {
  const body = cards
    .map(
      (c) => `<section class="card">
  <h2>${escapeHtml(c.name)}</h2>
  <img src="${c.qr}" alt="" width="220" height="220" />
  <div class="pin-label">${escapeHtml(pinLabel)}</div>
  <div class="pin">${escapeHtml(c.pin)}</div>
  <div class="url">${escapeHtml(c.url)}</div>
</section>`
    )
    .join('\n')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:24px;color:#212121}
h1{font-size:20px;margin:0 0 16px}
.card{display:inline-block;width:300px;margin:0 16px 24px 0;padding:16px;border:1px solid #d1d5db;border-radius:12px;text-align:center;page-break-inside:avoid}
h2{font-size:16px;margin:0 0 12px}
.pin-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-top:8px}
.pin{font-size:24px;font-weight:700;letter-spacing:.12em}
.url{font-size:11px;color:#6b7280;word-break:break-all;margin-top:8px}
</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`
}

/** Impression des fiches PIN (QR + PIN) des caisses de l'évènement. */
export function usePosPinSheet() {
  const { t } = useI18n()

  async function print(pdvs, eventName, { startedOnly = true } = {}) {
    const list = printablePdvs(pdvs, { startedOnly })
    if (!list.length || typeof window === 'undefined') return false
    const cards = await Promise.all(
      list.map(async (p) => {
        const url = posCashierUrl(p.qrSlug)
        return { name: p.name, pin: p.pin, url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) }
      })
    )
    const win = window.open('', '_blank')
    if (!win) return false
    win.document.open()
    win.document.write(
      buildPinSheetHtml({
        title: `${t('posPrintSheetTitle')} : ${eventName || ''}`.trim(),
        pinLabel: t('posPinLabel'),
        cards,
      })
    )
    win.document.close()
    win.focus()
    win.print()
    return true
  }

  return { print }
}
