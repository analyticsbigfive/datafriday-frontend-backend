// Logique pure de matching Sinking Rules (STF-2), extraite de StaffingInputsSection.vue pour être
// testable sans monter de composant — miroir de StaffingCalculatorService.applySinkingRules()
// (backend) : sans condition → toujours remplie ; avec condition → attrs[conditionAttribute] >=
// conditionMinValue. Toute divergence entre ce fichier et le backend fait mentir l'indicateur
// rempli/pas-rempli affiché dans le Builder — d'où le test dédié (sinkingRules.spec.js).

export function isSinkingRuleMet(rule, attributes) {
  if (!rule?.conditionAttribute) return true
  const v = Number((attributes || {})[rule.conditionAttribute])
  return Number.isFinite(v) && v >= (rule.conditionMinValue ?? 0)
}

// Règles dont le fnbCategory correspond à un sous-type de l'élément, enrichies du nom de rôle et
// de leur statut rempli/pas-rempli au regard des attributs COURANTS de l'élément.
export function relevantSinkingRules(rules, roles, subtypes, attributes) {
  const subtypeSet = new Set(subtypes || [])
  const rolesById = new Map((roles || []).map((r) => [r.id, r]))
  return (rules || [])
    .filter((rule) => subtypeSet.has(rule.fnbCategory))
    .map((rule) => ({
      ...rule,
      roleName: rolesById.get(rule.roleId)?.name || rule.roleId,
      met: isSinkingRuleMet(rule, attributes),
    }))
}
