// Présentation d'un moyen de paiement selon son `kind` (catégorie ouverte venue de l'API).
// Principe 1 bis : la caisse réagit à la catégorie, jamais au nom. Un kind inconnu retombe sur
// la présentation par défaut ; ajouter un kind = ajouter une entrée ici, sans toucher aux composants.

const PRESENTATION_BY_KIND = {
  cash: { iconKey: 'banknote', variant: 'outline' },
  card: { iconKey: 'card', variant: 'solid' },
  voucher: { iconKey: 'voucher', variant: 'outline' },
  cashless: { iconKey: 'phone', variant: 'solid' },
}

const DEFAULT_PRESENTATION = { iconKey: 'wallet', variant: 'outline' }

export function paymentPresentation(kind) {
  return PRESENTATION_BY_KIND[kind] || DEFAULT_PRESENTATION
}
