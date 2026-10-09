/**
 * Repli quand aucun worker n'est déployé : l'API importe alors BackgroundJobsModule.
 * Lu au chargement des modules (avant l'injection), d'où la lecture de process.env ici,
 * après que AppConfigModule a chargé les fichiers .env.
 */
export function backgroundJobsInApi(): boolean {
  return process.env.BACKGROUND_JOBS_IN_API === 'true';
}
