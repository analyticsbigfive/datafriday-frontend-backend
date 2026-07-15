// src/api/endpoints/onboarding.api.js
// API pour l'onboarding

import { api } from '../client'

/**
 * Vérifier le statut d'onboarding
 * @returns {Promise<Object>}
 */
export async function getOnboardingStatus() {
  return api.get('/onboarding/status')
}

/**
 * Compléter l'onboarding (créer organisation)
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function completeOnboarding(data) {
  return api.post('/onboarding', data)
}

/**
 * Rejoindre une organisation existante
 * @param {string} invitationCode 
 * @returns {Promise<Object>}
 */
export async function joinOrganization(invitationCode) {
  return api.post('/onboarding/join-by-code', { invitationCode })
}