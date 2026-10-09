// Fuseau fixe : les tests de dates ne doivent pas dépendre de la machine (Abidjan, CI...).
process.env.TZ = 'UTC';

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: '<rootDir>/../jest-environment.js',
  // Refuse de lancer les tests si .env ou l'environnement vise une base non locale.
  setupFiles: ['<rootDir>/../jest.db-guard.js'],
  // Laisse la machine utilisable pendant la suite complète.
  maxWorkers: '50%',
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/core/$1',
    '^@features/(.*)$': '<rootDir>/features/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
  },
};
