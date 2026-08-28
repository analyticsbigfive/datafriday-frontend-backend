// src/api/endpoints/notifications.api.js
// Notifications serveur persistées (décision Bertrand 08/2026 : in-app d'abord).
// Distinct du store `notifications` (purement local/localStorage, éphémère).
// Voir store/modules/serverNotifications.js pour la fusion des deux dans la cloche.

import { api } from '../client'

/** GET /notifications, 50 plus récentes de l'utilisateur connecté. */
export async function getNotifications() {
  return api.get('/notifications')
}

/** PATCH /notifications/:id/read */
export async function markNotificationRead(id) {
  return api.patch(`/notifications/${id}/read`)
}

/** PATCH /notifications/read-all */
export async function markAllNotificationsRead() {
  return api.patch('/notifications/read-all')
}
