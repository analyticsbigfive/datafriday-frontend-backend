module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    // Formatage : appliqué par un commit de reformatage dédié puis vérifié par
    // `prettier --check` en CI. Hors du lint pour ne pas noyer les vraies erreurs.
    'prettier/prettier': 'off',
    // Paramètres / variables volontairement ignorés : préfixe `_`.
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    // P1 : SQL brut uniquement dans `*.queries.ts` (tenantId en paramètre) et core/database.
    'no-restricted-syntax': [
      'error',
      {
        selector: 'MemberExpression[property.name=/^\\$(query|execute)Raw(Unsafe)?$/]',
        message: 'SQL brut interdit ici : le placer dans un fichier *.queries.ts avec tenantId en paramètre.',
      },      {
        // P8 : un corps typé librement échappe au ValidationPipe (type effacé à l'exécution).
        selector:
          "Identifier[decorators.0.expression.callee.name='Body'] > TSTypeAnnotation > :matches(TSAnyKeyword, TSUnknownKeyword, TSObjectKeyword, TSTypeLiteral, TSTypeReference[typeName.name=/^(Record|Partial|Pick|Omit|Required)$/])",
        message: 'Corps de requête sans validation : déclarer une classe DTO class-validator.',
      },
      {
        // P7 : une erreur sans statut HTTP sortait en 500 avec son message brut.
        selector: "ThrowStatement > NewExpression[callee.name='Error']",
        message: 'Lever une exception Nest (BadRequestException, NotFoundException, InternalServerErrorException...).',
      },
    ],
    // P9 : la configuration se lit via AppConfigService (validée au démarrage).
    // Un fichier source au-delà de 600 lignes se découpe par responsabilité (plan de remédiation P3).
    'max-lines': ['error', { max: 600, skipBlankLines: false, skipComments: false }],
    // Requêtes en boucle (N+1) : traiter en lot, ou annoter la raison d'une boucle séquentielle voulue.
    'no-await-in-loop': 'error',
    'no-restricted-properties': [
      'error',
      { object: 'process', property: 'env', message: 'Lire la configuration via AppConfigService (src/config).' },
    ],
  },
  overrides: [
    {
      files: ['src/config/**/*.ts', 'src/main.ts', 'src/worker.ts', 'src/**/*.spec.ts'],
      rules: { 'no-restricted-properties': 'off' },
    },
    {
      // SQL brut autorisé ici ; l'interdiction de `throw new Error` reste active.
      files: ['src/**/*.queries.ts', 'src/core/database/**/*.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "ThrowStatement > NewExpression[callee.name='Error']",
            message: 'Lever une exception Nest (BadRequestException, NotFoundException, InternalServerErrorException...).',
          },
        ],
      },
    },
    {
      // Contrôleurs : HTTP uniquement, l'accès aux données passe par un service.
      files: ['src/**/*.controller.ts'],
      excludedFiles: ['src/health/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/core/database/prisma.service'],
                message: "Pas de PrismaService dans un contrôleur : déléguer à un service de la feature.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/**/*.spec.ts'],
      rules: { 'no-restricted-syntax': 'off', 'max-lines': 'off', 'no-await-in-loop': 'off' },
    },
  ],
};
