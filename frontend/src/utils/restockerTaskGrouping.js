// Regroupements de la file de tâches du drawer Restocker (Live inventory), extraits de
// RestockerDrawer.vue pour les mêmes raisons que liveInventoryRows.js : transformations
// pures, testables sans monter le composant, qui reste concentré sur le rendu.

/** Une tâche par staff assigné, dans l'ordre d'apparition dans la file. */
export function groupTasksByStaff(tasks) {
  const groups = [];
  const byKey = new Map();
  for (const task of tasks) {
    const key = task.assignedToUserId || '—';
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: task.assignedToName || key, tasks: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.tasks.push(task);
  }
  return groups;
}

/** Une tâche par trajet (origine → destination), dans l'ordre d'apparition dans la file. */
export function groupTasksByRoute(tasks) {
  const groups = [];
  const byKey = new Map();
  for (const task of tasks) {
    const key = `${task.sourceElementId}::${task.destinationElementId}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        sourceElementName: task.sourceElementName,
        destinationElementName: task.destinationElementName,
        tasks: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.tasks.push(task);
  }
  return groups;
}
