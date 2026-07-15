# i18n - Système de Traduction Centralisé

Ce dossier contient le système de traduction centralisé pour toute l'application.

## Structure

```
i18n/
├── index.js          # Point d'entrée principal
├── translations.js   # Toutes les traductions (EN/FR)
├── useI18n.js       # Composable Vue pour utilisation réactive
└── README.md        # Cette documentation
```

## Utilisation

### Option 1: Import direct (pour composants Options API)

```javascript
import { t, getCurrentLocale, setCurrentLocale } from '@/i18n';

export default {
  data() {
    return {
      locale: getCurrentLocale(),
    };
  },
  methods: {
    t(key) {
      return t(key, this.locale);
    },
    changeLocale(newLocale) {
      setCurrentLocale(newLocale);
      this.locale = newLocale;
    },
  },
  mounted() {
    window.addEventListener('locale-changed', (e) => {
      this.locale = e.detail.locale;
    });
  },
};
```

### Option 2: Composable (pour Composition API)

```javascript
import { useI18n } from '@/i18n/useI18n';

export default {
  setup() {
    const { t, locale, setLocale } = useI18n();
    
    return {
      t,
      locale,
      setLocale,
    };
  },
};
```

### Dans le template

```vue
<template>
  <div>
    <h1>{{ t('suppliers') }}</h1>
    <p>{{ t('subtitle') }}</p>
  </div>
</template>
```

## Ajouter de nouvelles traductions

Éditez le fichier `translations.js` et ajoutez vos clés dans les deux langues :

```javascript
export const translations = {
  en: {
    myNewKey: 'My new translation',
  },
  fr: {
    myNewKey: 'Ma nouvelle traduction',
  },
};
```

## Changer la langue

```javascript
import { setCurrentLocale } from '@/i18n';

// Changer en français
setCurrentLocale('fr');

// Changer en anglais
setCurrentLocale('en');
```

## Événements

Le système émet un événement global `locale-changed` quand la langue change :

```javascript
window.addEventListener('locale-changed', (event) => {
  console.log('New locale:', event.detail.locale);
});
```

## Langues supportées

- `en` - English
- `fr` - Français

## Stockage

La langue sélectionnée est automatiquement sauvegardée dans `localStorage` sous la clé `appLocale`.
