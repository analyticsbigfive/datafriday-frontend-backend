// CFG-2 Étape 4 : HR_DEPARTMENTS (liste figée) retiré. HrRole.department valide désormais son
// existence contre la table globale `Department` (filtrée `needsRh: true`, cf. normalizeRole()
// du service des rôles), et stocke `code ?? id` plutôt que le libellé (même idiome que SpaceElement.type).
export const HR_CONTRACT_TYPES = ['CDD', 'FREELANCE', 'CDI', 'AGENCY', 'OTHER'] as const;
export const HR_RATE_TYPES = ['HOURLY', 'DAILY', 'MONTHLY'] as const;
export const HR_PERSON_CONTRACTS = ['CDI', 'CDD'] as const;
/** Contract types pour lesquels rateType + rate sont requis (spec §2.1). */
export const HR_RATE_REQUIRED_CONTRACTS = ['CDD', 'AGENCY', 'FREELANCE'] as const;
