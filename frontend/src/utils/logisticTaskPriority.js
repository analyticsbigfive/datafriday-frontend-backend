// Priorité des tâches Restocker/Logistic (LogisticTaskPriority, backend) : ordre
// d'urgence, couleur et clé i18n, partagés entre RestockerDrawer (création) et
// LogisticTasksPanel (exécution) pour ne jamais diverger visuellement.

export const PRIORITY_ORDER = ['VERY_URGENT', 'URGENT', 'TODO', 'NOT_PRIORITY'];

export const PRIORITY_LABEL_KEYS = {
  VERY_URGENT: 'restockPriorityVeryUrgent',
  URGENT: 'restockPriorityUrgent',
  TODO: 'restockPriorityTodo',
  NOT_PRIORITY: 'restockPriorityNotPriority',
};

const PRIORITY_COLORS = {
  VERY_URGENT: '#7c3aed',
  URGENT: '#ff3131',
  TODO: '#fab219',
  NOT_PRIORITY: '#fde68a',
};

const PRIORITY_RANK = Object.fromEntries(PRIORITY_ORDER.map((p, i) => [p, i]));

export function priorityColor(priority) {
  return PRIORITY_COLORS[priority] || '#9ca3af';
}

/** Rang croissant = plus urgent d'abord ; priorité inconnue reléguée en dernier. */
export function priorityRank(priority) {
  return PRIORITY_RANK[priority] ?? PRIORITY_ORDER.length;
}
