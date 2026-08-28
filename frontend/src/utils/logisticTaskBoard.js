// Regroupement du panneau Tasks (Logistic, mockup "Déclenchement d'un restockage") :
// une fois filtrées par statut (onglet actif, géré par le composant), les tâches se
// regroupent selon UNE dimension au choix (staff / article / lieu de retrait / lieu de
// dépôt), avec quantité totale sommée par groupe. Extrait pour rester testable sans
// monter le composant, même principe que liveInventoryRows.js / restockerTaskGrouping.js.

import { priorityRank } from './logisticTaskPriority';

export const GROUP_DIMENSIONS = ['staff', 'item', 'source', 'destination'];

const KEY_OF = {
  staff: (t) => t.assignedToUserId,
  item: (t) => t.itemRefId || t.itemKey,
  source: (t) => t.sourceElementId,
  destination: (t) => t.destinationElementId,
};

const LABEL_OF = {
  staff: (t) => t.assignedToName,
  item: (t) => t.itemKey,
  source: (t) => t.sourceElementName,
  destination: (t) => t.destinationElementName,
};

function byPriorityThenAge(a, b) {
  return priorityRank(a.priority) - priorityRank(b.priority) || new Date(a.createdAt) - new Date(b.createdAt);
}

/**
 * @param {Array} tasks déjà filtrées par statut par l'appelant (un seul statut à la fois,
 *   sinon sommer des quantités PENDING+COMPLETED n'aurait pas de sens opérationnel)
 * @param {'staff'|'item'|'source'|'destination'} dimension
 * @returns {Array<{key, label, tasks, totalPacked, totalLoose, itemKey, itemRefId}>}
 *   totalPacked/totalLoose : somme brute du groupe. N'a de sens affiché tel quel que pour
 *   dimension='item' (mêmes unités garanties), les autres dimensions mélangent des denrées
 *   différentes, le composant affiche alors un simple compte de tâches.
 */
export function groupTasksByDimension(tasks, dimension) {
  const keyFn = KEY_OF[dimension] || KEY_OF.staff;
  const labelFn = LABEL_OF[dimension] || LABEL_OF.staff;
  const groups = [];
  const byKey = new Map();
  for (const task of tasks) {
    const key = keyFn(task) || '—';
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: labelFn(task) || key,
        tasks: [],
        totalPacked: 0,
        totalLoose: 0,
        itemKey: task.itemKey,
        itemRefId: task.itemRefId,
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.tasks.push(task);
    group.totalPacked += Number(task.packedQty) || 0;
    group.totalLoose += Number(task.looseQty) || 0;
  }
  for (const group of groups) group.tasks.sort(byPriorityThenAge);
  return groups.sort((a, b) => b.tasks.length - a.tasks.length || a.label.localeCompare(b.label, 'fr'));
}
