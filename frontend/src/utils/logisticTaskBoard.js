// Regroupement du panneau Tasks (Logistic, mockup "Déclenchement d'un restockage") :
// un groupe par staff assigné, statuts séparés (Pending/Ongoing/Closed, mêmes noms que
// LogisticTaskStatus PENDING/PICKED_UP/COMPLETED côté backend), tâches ouvertes triées
// par priorité puis par ancienneté. Extrait pour rester testable sans monter le
// composant, même principe que liveInventoryRows.js / restockerTaskGrouping.js.

import { priorityRank } from './logisticTaskPriority';

function byPriorityThenAge(a, b) {
  return priorityRank(a.priority) - priorityRank(b.priority) || new Date(a.createdAt) - new Date(b.createdAt);
}

/**
 * @param {Array} tasks réponse brute de GET /spaces/:id/logistic-tasks (tous statuts)
 * @returns {Array<{key, name, pending: [], ongoing: [], closed: []}>} un groupe par
 *   staff, triés par charge ouverte décroissante (celui qui a le plus à faire en premier).
 */
export function groupLogisticTasksByStaff(tasks) {
  const groups = [];
  const byKey = new Map();
  for (const task of tasks) {
    const key = task.assignedToUserId || '—';
    let group = byKey.get(key);
    if (!group) {
      group = { key, name: task.assignedToName || key, pending: [], ongoing: [], closed: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    if (task.status === 'PENDING') group.pending.push(task);
    else if (task.status === 'PICKED_UP') group.ongoing.push(task);
    else group.closed.push(task);
  }
  for (const group of groups) {
    group.pending.sort(byPriorityThenAge);
    group.ongoing.sort(byPriorityThenAge);
    group.closed.sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));
  }
  return groups.sort(
    (a, b) => (b.pending.length + b.ongoing.length) - (a.pending.length + a.ongoing.length) || a.name.localeCompare(b.name, 'fr'),
  );
}
