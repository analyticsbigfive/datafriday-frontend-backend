<template>
  <Teleport to="body">
  <Transition name="mi-import">
  <div v-if="modelValue" class="mi-import-overlay" @mousedown.self="$emit('update:modelValue', false)">
  <div class="mi-import-panel" :class="{ 'mi-import--dark': isDark }">
    <!-- ── Header ─────────────────────────────────────────── -->
    <div class="mi-header">
      <div class="mi-header__icon"><FileSpreadsheet :size="20" color="white" /></div>
      <div class="mi-header__text">
        <div class="mi-header__title">{{ t('menuItemImportTitle') }}</div>
        <div class="mi-header__sub">{{ stepDesc }}</div>
      </div>
      <button class="mi-header__close" @click="close"><X :size="16" /></button>
    </div>

    <!-- ── Step bar ───────────────────────────────────────── -->
    <div class="mi-stepbar px-5 pt-5 pb-4">
      <div class="d-flex align-center" style="gap: 0;">
        <template v-for="(s, i) in stepLabels" :key="i">
          <div class="d-flex align-center" style="gap: 8px; flex-shrink: 0;">
            <div class="mi-dot" :class="dotClass(i)">
              <CheckCircle2 v-if="step > i + 1" :size="13" />
              <span v-else>{{ i + 1 }}</span>
            </div>
            <span class="mi-step-label" :class="step >= i + 1 ? 'mi-step-label--active' : 'mi-step-label--inactive'">
              {{ s }}
            </span>
          </div>
          <div v-if="i < stepLabels.length - 1" class="mi-step-line" :class="{ 'mi-step-line--done': step > i + 1 }" />
        </template>
      </div>
    </div>

    <v-divider class="mi-divider" />

    <!-- ── Body ──────────────────────────────────────────── -->
    <div class="mi-body pa-5">

      <!-- Step 1 : Upload ── -->
      <div v-if="step === 1" class="mi-step1">
        <input ref="fileInput" type="file" accept=".csv,.tsv,text/csv" style="display:none" @change="onFileChange" />

        <div
          class="mi-dropzone d-flex flex-column align-center justify-center"
          :class="{ 'mi-dropzone--hover': dropping }"
          @click="$refs.fileInput.click()"
          @dragover.prevent="dropping = true"
          @dragleave.prevent="dropping = false"
          @drop.prevent="onDrop"
        >
          <div class="mi-dropzone-icon mb-4">
            <FileSpreadsheet :size="44" />
          </div>
          <div class="text-subtitle-1 font-weight-semibold mb-1 mi-title">
            {{ t('menuItemImportDropzone') }}
          </div>
          <div class="text-body-2 mi-subtitle mb-5">{{ t('menuItemImportDropzoneOr') }}</div>
          <v-btn
            variant="outlined"
            rounded="lg"
            size="small"
            class="text-none mi-outline-btn"
            @click.stop="$refs.fileInput.click()"
          >
            <Upload :size="15" class="mr-2" />
            {{ t('menuItemImportChooseFile') }}
          </v-btn>
        </div>

        <!-- Format hint — même structure que MarketPriceCsvImportDrawer.vue exactement
             (titre + description + lien "Download template", sans liste de colonnes). -->
        <v-card class="mi-hint-card mt-4 pa-4" rounded="lg" elevation="0">
          <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 8px;">
            <div>
              <div class="text-body-2 font-weight-medium mb-1 mi-title">{{ t('menuItemImportExpectedFormat') }}</div>
              <div class="text-caption mi-subtitle">{{ t('menuItemImportFormatDesc') }}</div>
            </div>
            <v-btn variant="text" size="small" class="text-none" @click="downloadTemplate">
              <Download :size="14" class="mr-1" />
              {{ t('menuItemImportDownloadTemplate') }}
            </v-btn>
          </div>
        </v-card>

        <!-- Fichiers compagnons optionnels : résolvent les vieux ids de la colonne "Recipe"
             (format packé, fichier historique) par nom — jamais uploadés/persistés, parsés en
             mémoire uniquement. Même principe que ComponentCsvImportDrawer.vue. -->
        <v-divider class="my-5" />
        <div class="text-body-2 font-weight-medium mb-1 mi-title">{{ t('menuItemImportCompanionTitle') }}</div>
        <div class="text-caption mi-subtitle mb-3">{{ t('menuItemImportCompanionDesc') }}</div>

        <input ref="companionMarketPricesInput" type="file" accept=".csv,text/csv" style="display:none" @change="onCompanionMarketPricesChange" />
        <div class="mi-companion-row d-flex align-center mb-2" @click="$refs.companionMarketPricesInput.click()">
          <FileSpreadsheet :size="18" class="mr-2" style="flex-shrink:0" />
          <span class="text-body-2" style="flex:1">{{ companionMarketPricesFileName || t('menuItemImportCompanionMarketPrices') }}</span>
          <button v-if="companionMarketPricesFileName" class="mi-companion-clear" @click.stop="companionMarketPricesFileName = ''; companionMarketPricesMap = null"><X :size="14" /></button>
        </div>

        <input ref="companionComponentsInput" type="file" accept=".csv,text/csv" style="display:none" @change="onCompanionComponentsChange" />
        <div class="mi-companion-row d-flex align-center" @click="$refs.companionComponentsInput.click()">
          <FileSpreadsheet :size="18" class="mr-2" style="flex-shrink:0" />
          <span class="text-body-2" style="flex:1">{{ companionComponentsFileName || t('menuItemImportCompanionComponents') }}</span>
          <button v-if="companionComponentsFileName" class="mi-companion-clear" @click.stop="companionComponentsFileName = ''; companionComponentsMap = null"><X :size="14" /></button>
        </div>
      </div>

      <!-- Step 2 : Mapping (BUG-112) — un v-select par champ interne, comme
           MarketPriceCsvImportDrawer.vue : auto-détecté au chargement, corrigible ici. -->
      <div v-if="step === 2">
        <div class="mi-file-bar d-flex align-center mb-4 pa-3 rounded-lg" style="gap: 10px;">
          <FileSpreadsheet :size="16" class="mi-hint-icon" style="flex-shrink:0" />
          <span class="text-body-2 font-weight-medium mi-title" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ fileName }}</span>
          <v-chip size="x-small" variant="tonal">{{ rawRows.length }} rows</v-chip>
        </div>

        <v-alert
          v-if="!mapping.name"
          type="warning"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mb-4"
          text="Map the &quot;Name&quot; field to a column to continue."
        />

        <div v-for="group in mappingGroups" :key="group.key" class="mb-4">
          <div class="mi-mapping-group-label">{{ group.label }}</div>
          <div v-for="field in group.fields" :key="field.key" class="d-flex align-center mb-2" style="gap: 12px;">
            <div class="mi-mapping-label">
              {{ field.label }}<span v-if="field.required" class="mi-required">*</span>
            </div>
            <v-select
              :model-value="mapping[field.key]"
              @update:model-value="setMapping(field.key, $event)"
              :items="columnOptions"
              item-title="title"
              item-value="value"
              density="compact"
              variant="outlined"
              hide-details
              rounded="lg"
              style="flex: 1; min-width: 0;"
            />
          </div>
        </div>
      </div>

      <!-- Step 3 : Preview ── -->
      <div v-if="step === 3">
        <!-- File info bar -->
        <div class="mi-file-bar d-flex align-center mb-4 pa-3 rounded-lg" style="gap: 10px;">
          <FileSpreadsheet :size="16" class="mi-hint-icon" style="flex-shrink:0" />
          <span class="text-body-2 font-weight-medium mi-title" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ fileName }}</span>
          <v-chip size="x-small" color="#ff3131" variant="flat" class="text-white">
            {{ validRows.length }} {{ t('menuItemImportValid') }}
          </v-chip>
          <v-chip v-if="invalidRows.length" size="x-small" color="error" variant="tonal">
            {{ invalidRows.length }} {{ t('menuItemImportErrors') }}
          </v-chip>
          <v-chip v-if="duplicateRows.length" size="x-small" color="warning" variant="tonal">
            {{ duplicateRows.length }} déjà existants
          </v-chip>
        </div>

        <!-- BUG-88 : fichier vide ou en-têtes non reconnus -->
        <v-alert
          v-if="emptyParseWarning"
          type="warning"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mb-4"
          :text="emptyParseWarning"
        />

        <!-- BUG-112 : référentiels manquants qui seront créés automatiquement à l'import —
             informatif, pas une erreur (contrairement à avant, BUG-110/111). -->
        <v-alert
          v-if="pendingCreationsCount"
          type="info"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mb-4"
          :text="`${pendingCreationsCount} referential value(s) will be created automatically (type/category/brand/display name not found in this account).`"
        />

        <!-- Skipped warning (BUG-87 : nom/type/catégorie non résolus) — repliée par défaut
             (BUG-111 : trop de bruit visuel pour de l'information sans action possible). -->
        <v-alert
          v-if="invalidRows.length"
          type="warning"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mb-4"
        >
          <div class="d-flex align-center justify-space-between" style="gap: 8px;">
            <span>{{ invalidRows.length }} {{ t('menuItemImportSkipped') }}</span>
            <button class="mi-detail-toggle" @click="showInvalidDetail = !showInvalidDetail">
              {{ showInvalidDetail ? t('menuItemImportHideDetails') : t('menuItemImportShowDetails') }}
            </button>
          </div>
          <div v-if="showInvalidDetail" class="mi-skip-list mt-2 pa-3 rounded-lg text-caption">
            <div v-for="(r, i) in invalidRows.slice(0, 10)" :key="i">
              • {{ r.row.name || '(sans nom)' }} : {{ r.reason }}
            </div>
            <div v-if="invalidRows.length > 10">… +{{ invalidRows.length - 10 }}</div>
          </div>
        </v-alert>

        <!-- BUG-86 : lignes ignorées car un menu item du même nom existe déjà -->
        <v-alert
          v-if="duplicateRows.length"
          type="info"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mb-4"
        >
          <div class="d-flex align-center justify-space-between" style="gap: 8px;">
            <span>{{ duplicateRows.length }} ligne(s) ignorée(s) — déjà existantes dans le catalogue</span>
            <button class="mi-detail-toggle" @click="showDuplicateDetail = !showDuplicateDetail">
              {{ showDuplicateDetail ? t('menuItemImportHideDetails') : t('menuItemImportShowDetails') }}
            </button>
          </div>
          <div v-if="showDuplicateDetail" class="mi-skip-list mt-2 pa-3 rounded-lg text-caption">
            <div v-for="(row, i) in duplicateRows.slice(0, 10)" :key="i">
              • {{ row.name }}
            </div>
            <div v-if="duplicateRows.length > 10">… +{{ duplicateRows.length - 10 }}</div>
          </div>
        </v-alert>

        <!-- BUG-107 : lignes de recette (Ingredient/Component/Packaging) dont le nom ne
             correspond à rien dans ce compte — l'article sera quand même créé, juste sans
             cette ligne précise. -->
        <v-alert
          v-if="unresolvedRecipeLines.length"
          type="warning"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="mb-4"
        >
          <div class="d-flex align-center justify-space-between" style="gap: 8px;">
            <span>{{ unresolvedRecipeLines.length }} ligne(s) de recette introuvable(s) — l'article sera créé sans elles</span>
            <button class="mi-detail-toggle" @click="showUnresolvedDetail = !showUnresolvedDetail">
              {{ showUnresolvedDetail ? t('menuItemImportHideDetails') : t('menuItemImportShowDetails') }}
            </button>
          </div>
          <div v-if="showUnresolvedDetail" class="mi-skip-list mt-2 pa-3 rounded-lg text-caption">
            <div v-for="(l, i) in unresolvedRecipeLines.slice(0, 10)" :key="i">
              • {{ l.item }} — {{ l.type }} "{{ l.name }}"
            </div>
            <div v-if="unresolvedRecipeLines.length > 10">… +{{ unresolvedRecipeLines.length - 10 }}</div>
          </div>
        </v-alert>

        <!-- Preview table -->
        <div class="mi-table-wrap rounded-lg" style="overflow:hidden;">
          <v-table density="compact" class="mi-preview-table">
            <thead>
              <tr>
                <th
                  v-for="col in visibleColumns"
                  :key="col.key"
                  class="text-caption font-weight-bold"
                  style="text-transform:uppercase; font-size:0.62rem; letter-spacing:0.05em; white-space:nowrap;"
                >
                  {{ col.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in previewRows" :key="i">
                <td
                  v-for="col in visibleColumns"
                  :key="col.key"
                  class="text-caption"
                  style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
                >
                  {{ row[col.key] || '—' }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
        <div v-if="validRows.length > 5" class="text-caption mi-subtitle mt-2 text-center">
          … {{ t('menuItemImportMoreRows') }} ({{ validRows.length - 5 }})
        </div>
      </div>

      <!-- Step 4 : Result ── -->
      <div v-if="step === 4">
        <!-- Loading -->
        <div v-if="importing" class="d-flex flex-column align-center justify-center py-14" style="gap: 18px;">
          <v-progress-circular indeterminate color="#ff3131" size="52" width="4" />
          <div class="text-body-2 mi-subtitle">{{ t('menuItemImportInProgress') }}</div>
        </div>

        <!-- Error -->
        <div v-else-if="importError" class="d-flex flex-column align-center justify-center py-12" style="gap: 12px;">
          <div class="mi-result-icon mi-result-icon--error">
            <AlertCircle :size="32" />
          </div>
          <div class="text-h6 font-weight-bold mi-title">{{ t('menuItemImportError') }}</div>
          <div class="text-body-2 mi-subtitle text-center" style="max-width:360px;">{{ importError }}</div>
        </div>

        <!-- Success (BUG-85 : succès total OU partiel, détail des échecs affiché) -->
        <div v-else class="d-flex flex-column align-center justify-center py-12" style="gap: 12px;">
          <div class="mi-result-icon" :class="importFailed.length ? 'mi-result-icon--error' : 'mi-result-icon--success'">
            <CheckCircle2 v-if="!importFailed.length" :size="32" />
            <AlertCircle v-else :size="32" />
          </div>
          <div class="text-h6 font-weight-bold mi-title">
            {{ importFailed.length ? 'Import partiellement réussi' : t('menuItemImportSuccess') }}
          </div>
          <div class="text-body-2 mi-subtitle">{{ importedCount }} {{ t('menuItemImportItems') }}</div>

          <!-- BUG-112 : récapitulatif des référentiels créés automatiquement pendant cet import -->
          <v-alert
            v-if="autoCreatedSummary"
            type="info"
            variant="tonal"
            density="compact"
            rounded="lg"
            style="max-width:420px;"
            :text="`Automatically created: ${autoCreatedSummary}`"
          />

          <v-alert
            v-if="importBulkCountUnknown"
            type="warning"
            variant="tonal"
            density="compact"
            rounded="lg"
            style="max-width:420px;"
            text="Le nombre de lignes réellement créées par le lot n'a pas pu être confirmé par le serveur (réponse sans compteur) — vérifiez le catalogue avant de réimporter."
          />

          <div v-if="importFailed.length" class="mi-skip-list pa-3 rounded-lg text-caption mi-subtitle" style="max-width:420px; width:100%;">
            <div class="font-weight-bold mb-1">{{ importFailed.length }} ligne(s) en échec :</div>
            <div v-for="(f, i) in importFailed.slice(0, 10)" :key="i">
              • {{ f.name }} : {{ f.message }}
            </div>
            <div v-if="importFailed.length > 10">… +{{ importFailed.length - 10 }}</div>
          </div>
        </div>
      </div>

    </div>

    <!-- ── Footer ─────────────────────────────────────────── -->
    <v-divider class="mi-divider" />
    <div class="mi-footer d-flex align-center pa-4" style="gap: 8px;">
        <v-btn
          v-if="step === 1"
          variant="text"
          rounded="lg"
          class="text-none mi-text-btn"
          @click="close"
        >
          {{ t('menuItemImportCancel') }}
        </v-btn>
        <v-btn
          v-if="step === 2 || step === 3"
          variant="outlined"
          rounded="lg"
          class="text-none mi-outline-btn"
          @click="step--"
        >
          {{ t('menuItemImportBack') }}
        </v-btn>

        <div class="flex-grow-1" />

        <v-btn
          v-if="step === 2"
          color="#ff3131"
          variant="flat"
          rounded="lg"
          class="text-white text-none"
          :disabled="!mapping.name"
          elevation="0"
          @click="step = 3"
        >
          {{ t('menuItemImportNext') }}
        </v-btn>

        <v-btn
          v-if="step === 3"
          color="#ff3131"
          variant="flat"
          rounded="lg"
          class="text-white text-none"
          :disabled="!validRows.length"
          elevation="0"
          @click="runImport"
        >
          {{ t('menuItemImportRun') }} {{ validRows.length }} {{ t('menuItemImportValid') }}
        </v-btn>

        <v-btn
          v-if="step === 4 && !importing"
          color="#ff3131"
          variant="flat"
          rounded="lg"
          class="text-white text-none"
          elevation="0"
          @click="close"
        >
          {{ t('menuItemImportClose') }}
        </v-btn>
    </div>
  </div>
  </div>
  </Transition>
  </Teleport>
</template>

<script>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'
import { bulkCreateMenuItems, createMenuItem } from '@/api/endpoints/menu-item.api'
import { createProductType, createProductCategory } from '@/api/endpoints/product.api'
import { createBrandName } from '@/api/endpoints/brand-name.api'
import { createDisplayName } from '@/api/endpoints/display-name.api'
import { X, FileSpreadsheet, Upload, CheckCircle2, AlertCircle, Download } from 'lucide-vue-next'

// BUG-112 : champs mappables, groupés pour l'écran "Mapping" (même pattern que
// MarketPriceCsvImportDrawer.vue : un v-select par champ interne, pas par colonne CSV).
// Sert aussi de source pour l'en-tête du tableau d'aperçu (visibleColumns).
const MENU_ITEM_FIELDS = [
  { key: 'csvId',          label: 'Menu Item ID',                required: false, group: 'identity' },
  { key: 'name',           label: 'Name',                       required: true,  group: 'identity' },
  { key: 'type',           label: 'Type',                       required: false, group: 'identity' },
  { key: 'category',       label: 'Category',                   required: false, group: 'identity' },
  { key: 'brand',          label: 'Brand',                       required: false, group: 'identity' },
  { key: 'displayNameRef', label: 'Display Name Ref',            required: false, group: 'identity' },
  { key: 'basePrice',      label: 'Price TTC',                  required: false, group: 'pricing' },
  { key: 'vatRate',        label: 'VAT %',                      required: false, group: 'pricing' },
  { key: 'discountType',   label: 'Discount Type',               required: false, group: 'pricing' },
  { key: 'discountValue',  label: 'Discount Value',              required: false, group: 'pricing' },
  { key: 'readyForSale',   label: 'Ready for Sale',             required: false, group: 'details' },
  { key: 'comboItem',      label: 'Combo Item',                 required: false, group: 'details' },
  { key: 'kitchenType',    label: 'Kitchen Type',                required: false, group: 'details' },
  { key: 'numberOfPiecesRecipe', label: 'Number of Pieces (Recipe)', required: false, group: 'details' },
  { key: 'storageType',    label: 'Storage Type',               required: false, group: 'details' },
  { key: 'diet',           label: 'Diet',                       required: false, group: 'details' },
  { key: 'space',          label: 'Space',                       required: false, group: 'details' },
  { key: 'inventoryPackagingType', label: 'Packaging Type',      required: false, group: 'details' },
  { key: 'inventoryNumberOfUnits', label: 'Number of units',     required: false, group: 'details' },
  { key: 'description',    label: 'Description',                required: false, group: 'details' },
  { key: 'lineType',       label: 'Line Type',                   required: false, group: 'recipe' },
  { key: 'lineItemName',   label: 'Line Item Name',              required: false, group: 'recipe' },
  { key: 'lineQuantity',   label: 'Line Quantity',                required: false, group: 'recipe' },
  { key: 'lineUnitCost',   label: 'Line Unit Cost',              required: false, group: 'recipe' },
  { key: 'lineTotalCost',  label: 'Line Total Cost',              required: false, group: 'recipe' },
  { key: 'recipe',         label: 'Recipe (legacy)',            required: false, group: 'legacy' },
]
const MAPPING_GROUP_LABELS = {
  identity: 'Identity',
  pricing: 'Pricing',
  details: 'Details',
  recipe: 'Recipe (one row per ingredient/component/packaging)',
  legacy: 'Legacy',
}

// Maps CSV column headers (lowercase, trimmed) → internal key names
// BUG-88 : alias FR ajoutés (nom, catégorie, prix de base, prêt à la vente, …) sur le
// modèle de l'alias 'recette' déjà présent, pour les exports CSV en français.
// BUG-107 : colonnes du nouvel export "une ligne par ligne de recette" (MenuItemView.onExportCsv)
// ajoutées, pour permettre un aller-retour export→import complet.
const HEADER_MAP = {
  'menu item id':     'csvId',
  'name':             'name',
  'display name':     'name', // alias historique : "Display Name" = nom de l'article lui-même
  'nom':              'name',
  "nom de l'article": 'name',
  'type':             'type',
  'category':         'category',
  'catégorie':        'category',
  'categorie':        'category',
  'baseprice':        'basePrice',
  'base price':       'basePrice',
  'price':            'basePrice',
  'price ttc':        'basePrice',
  'prix':             'basePrice',
  'prix ttc':         'basePrice',
  'prix de base':     'basePrice',
  'vat %':            'vatRate',
  'vat':              'vatRate',
  'tva %':            'vatRate',
  'tva':              'vatRate',
  'readyforsale':     'readyForSale',
  'ready for sale':   'readyForSale',
  'prêt à la vente':  'readyForSale',
  'pret à la vente':  'readyForSale',
  'prêt a la vente':  'readyForSale',
  'pret a la vente':  'readyForSale',
  'comboitem':        'comboItem',
  'combo item':       'comboItem',
  'article combo':    'comboItem',
  'brand':            'brand',
  'brand name':       'brand',
  'marque':           'brand',
  // "Display Name Ref" (nouvel export, BUG-107) — DIFFÉRENT de l'alias historique
  // "display name" ci-dessus, qui lui désigne le nom de l'article.
  'display name ref': 'displayNameRef',
  'kitchen type':     'kitchenType',
  'cuisine':          'kitchenType',
  'number of pieces (recipe)': 'numberOfPiecesRecipe',
  'number of pieces': 'numberOfPiecesRecipe',
  'nombre de pièces (recette)': 'numberOfPiecesRecipe',
  'discount type':    'discountType',
  'discount value':   'discountValue',
  'storage type':     'storageType',
  'stockage':         'storageType',
  'diet':             'diet',
  'régime':           'diet',
  'regime':           'diet',
  'space':            'space',
  'spaces':           'space',
  'espace':           'space',
  'packaging type':   'inventoryPackagingType',
  'number of units':  'inventoryNumberOfUnits',
  'description':      'description',
  'recipe':           'recipe',
  'recette':          'recipe',
  // Nouvel export "une ligne par ligne de recette" (BUG-107) — résolues par NOM, pas par id.
  'line type':        'lineType',
  'line item name':   'lineItemName',
  'line quantity':    'lineQuantity',
  'line unit cost':   'lineUnitCost',
  'line total cost':  'lineTotalCost',
}

// BUG-107 : le nouvel export produit PLUSIEURS lignes CSV pour un même article (une par
// ingrédient/composant/packaging de sa recette, colonnes "Line Type"/"Line Item Name"/
// "Line Quantity"). Regroupe TOUJOURS les lignes par nom d'article (déduplique aussi les
// éventuels doublons exacts) : une ligne sans "Line Type"/"Line Item Name" mappé ou vide ne
// contribue simplement aucune ligne de recette au groupe.
function groupCsvRows(rows) {
  const groups = []
  const byName = new Map()
  for (const row of rows) {
    const key = String(row.name || '').trim().toLowerCase()
    if (!key) continue
    let group = byName.get(key)
    if (!group) {
      group = { ...row, recipeLines: [] }
      delete group.lineType
      delete group.lineItemName
      delete group.lineQuantity
      delete group.lineUnitCost
      delete group.lineTotalCost
      byName.set(key, group)
      groups.push(group)
    }
    const lineType = String(row.lineType || '').trim()
    const lineName = String(row.lineItemName || '').trim()
    if (lineType && lineName) {
      group.recipeLines.push({ type: lineType, name: lineName, qty: row.lineQuantity })
    }
  }
  return groups
}

// BUG-84 : tokenizer caractère par caractère sur le texte BRUT complet (pas de split par
// ligne avant parsing) — un champ entre guillemets peut contenir un vrai saut de ligne
// (cas fréquent en export Excel/Google Sheets), ce qu'un split(/\r?\n/) préalable casse.
// Gère aussi l'échappement `""` à l'intérieur d'un champ entre guillemets. Même approche
// que le tokenizer de RecipeImportDrawer.vue (parseCsv/split).
function tokenizeCsv(text) {
  const raw = String(text || '').replace(/^﻿/, '') // BOM éventuel
  const rows = []
  let row = []
  let cur = ''
  let inQuotes = false
  let rowHasContent = false

  const pushCell = () => { row.push(cur); cur = '' }
  const pushRow = () => {
    pushCell()
    if (rowHasContent || row.some(c => c !== '')) rows.push(row)
    row = []
    rowHasContent = false
  }

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (inQuotes) {
      if (ch === '"' && raw[i + 1] === '"') { cur += '"'; i++ } // "" échappé
      else if (ch === '"') { inQuotes = false }
      else { cur += ch }
      rowHasContent = true
      continue
    }
    if (ch === '"') { inQuotes = true; rowHasContent = true }
    else if (ch === ',') { pushCell(); rowHasContent = true }
    else if (ch === '\r') { if (raw[i + 1] === '\n') i++; pushRow() }
    else if (ch === '\n') { pushRow() }
    else { cur += ch; rowHasContent = true }
  }
  if (cur !== '' || row.length || rowHasContent) pushRow()

  return rows
}

// BUG-112 : parsing BRUT (en-têtes + lignes de valeurs), sans résolution de colonnes — la
// résolution "quelle colonne CSV correspond à quel champ interne" est déportée dans l'écran
// Mapping (auto-détectée via HEADER_MAP, corrigible manuellement), pas figée au parsing.
function parseCsvRaw(text) {
  const rows = tokenizeCsv(text)
  if (rows.length < 1) return { headers: [], dataRows: [] }
  const headers = rows[0].map(h => String(h || '').trim())
  const dataRows = rows.slice(1)
  return { headers, dataRows }
}

function toBool(v) {
  return ['yes', 'oui', 'true', '1'].includes(String(v || '').toLowerCase())
}

// Recipe column format: segments separated by "|"
// Each segment: localId>TypeLabel>refId[>refId2]>quantity
// TypeLabel: Ingredient | Packaging | Component | Combo Item
// Fonction pure (pas d'accès à `this`) : retourne les refs BRUTES, jamais résolues ici — sur un
// fichier historique, `refId` est un id de l'ancien système, pas un id/nom exploitable tel quel.
// Ingredient/Packaging sont résolus via le fichier compagnon Market Prices ; Component ET Combo
// Item sont traités de façon identique (même résolution en cascade : fichier compagnon
// Components d'abord, auto-référence à une autre ligne de CE fichier ensuite) — voir
// resolveLegacyRecipe().
function parseRecipe(recipeStr) {
  const ingredientRefs = [], packagingRefs = [], comboRefs = []
  if (recipeStr && recipeStr.trim()) {
    for (const seg of recipeStr.split('|')) {
      if (!seg.trim()) continue
      const parts = seg.split('>')
      if (parts.length < 4) continue
      const typeLabel = (parts[1] || '').trim().toLowerCase()
      const qty = parseFloat(parts[parts.length - 1]) || 0
      if (!qty) continue
      // prefer 4th field as entity ID (index 3); fall back to 3rd (index 2)
      const refId = (parts.length >= 5 && parts[3]?.trim()) ? parts[3].trim() : (parts[2] || '').trim()
      if (!refId) continue
      if (typeLabel === 'ingredient') ingredientRefs.push({ refId, quantity: qty })
      else if (typeLabel === 'component' || typeLabel === 'combo item') comboRefs.push({ refId, quantity: qty })
      else if (typeLabel === 'packaging') packagingRefs.push({ refId, quantity: qty })
    }
  }
  return { ingredientRefs, packagingRefs, comboRefs }
}

// Fichier compagnon Market Prices (packé, même format que le chantier Components) : construit
// une Map ancien Market Price ID -> Item Name pour résoudre les vieux ids Ingredient/Packaging.
function parseCompanionMarketPrices(text) {
  const { headers, dataRows } = parseCsvRaw(text)
  const map = new Map()
  const norm = s => String(s || '').toLowerCase().replace(/[\s_\-()]+/g, '')
  const headerNorm = headers.map(norm)
  const idxItemName = headerNorm.findIndex(h => ['itemname', 'name', 'nom', 'article'].includes(h))
  const idxMarketPrices = headerNorm.findIndex(h => ['marketprices', 'prixmarche', 'prixdumarche', 'prixfournisseurs'].includes(h))
  if (idxMarketPrices === -1 || idxItemName === -1) return map
  for (const row of dataRows) {
    const itemName = (row[idxItemName] || '').trim()
    const packed = (row[idxMarketPrices] || '').trim()
    if (!itemName || !packed) continue
    for (const seg of packed.split('|')) {
      const id = (seg.split('>')[0] || '').trim()
      if (id) map.set(id, itemName)
    }
  }
  return map
}

// Fichier compagnon Components (components-2026-07-30.csv lui-même) : construit une Map ancien
// Component ID -> Component Name pour résoudre les refs "Component"/"Combo Item" qui pointent
// vers un vrai MenuComponent déjà importé.
function parseCompanionComponents(text) {
  const { headers, dataRows } = parseCsvRaw(text)
  const map = new Map()
  const norm = s => String(s || '').toLowerCase().replace(/[\s_\-()]+/g, '')
  const headerNorm = headers.map(norm)
  const idxId = headerNorm.findIndex(h => ['componentid', 'id'].includes(h))
  const idxName = headerNorm.findIndex(h => ['componentname', 'name'].includes(h))
  if (idxId === -1 || idxName === -1) return map
  for (const row of dataRows) {
    const id = (row[idxId] || '').trim()
    const name = (row[idxName] || '').trim()
    if (id && name) map.set(id, name)
  }
  return map
}

export default {
  name: 'MenuItemCsvImportDrawer',
  components: { X, FileSpreadsheet, Upload, CheckCircle2, AlertCircle, Download },

  props: {
    modelValue:        { type: Boolean, default: false },
    productTypes:      { type: Array,   default: () => [] },
    productCategories: { type: Array,   default: () => [] },
  },
  emits: ['update:modelValue', 'imported'],

  setup() {
    const theme = useTheme()
    const { t } = useI18n()
    const isDark = computed(() => !!theme.global.current.value.dark)
    return { t, isDark }
  },

  data() {
    return {
      step: 1,
      dropping: false,
      fileName: '',
      // BUG-112 : parsing brut (en-têtes + lignes de valeurs) séparé du mapping — csvRows
      // (le résultat mappé/groupé consommé par le reste du composant) devient un computed.
      csvHeaders: [],
      rawRows: [],
      mapping: {}, // { [fieldKey]: rawHeaderString|null }
      emptyParseWarning: '', // BUG-88 : message explicite quand le parsing produit 0 ligne
      importing: false,
      importError: '',
      importedCount: 0,
      importFailed: [],         // BUG-85 : [{ name, message }] des lignes withRecipe en échec
      importBulkCountUnknown: false, // BUG-85 : la réponse bulk n'a pas renvoyé de count exploitable
      // BUG-111 : listes repliées par défaut (bruit visuel sans action possible dessus).
      showInvalidDetail: false,
      showDuplicateDetail: false,
      showUnresolvedDetail: false,
      // BUG-112 : référentiels créés automatiquement PENDANT cet import (nom non résolu dans
      // le compte cible) — mêmes formes que productTypes/productCategories (props) et
      // brandNames/displayNames (store), pour que les résolutions suivantes les retrouvent.
      createdTypes: [],
      createdCategories: [],
      createdBrands: [],
      createdDisplayNames: [],
      // Fichiers compagnons optionnels (résolution des refs legacy Ingredient/Packaging/Component
      // du fichier historique — même principe que ComponentCsvImportDrawer.vue) : parsés en
      // mémoire uniquement, jamais uploadés/persistés.
      companionMarketPricesFileName: '',
      companionMarketPricesMap: null,
      companionComponentsFileName: '',
      companionComponentsMap: null,
      // Progression pendant l'import (concurrence bornée) — absente avant ce chantier, ajoutée
      // sur le modèle de CsvImportDrawer.vue (événements, BUG-252).
      importTotal: 0,
      unresolvedComboRefs: [], // [{ name, refId }] — refs Component/Combo Item non résolues, passe 2
    }
  },

  computed: {
    stepLabels() {
      return [
        this.t('menuItemImportStep1'),
        this.t('menuItemImportStepMapping'),
        this.t('menuItemImportStep2'),
        this.t('menuItemImportStep3'),
      ]
    },
    stepDesc() {
      return [
        this.t('menuItemImportStep1Desc'),
        this.t('menuItemImportStepMappingDesc'),
        this.t('menuItemImportStep2Desc'),
        this.t('menuItemImportStep3Desc'),
      ][this.step - 1]
    },
    // BUG-112 : options du v-select de chaque champ, à l'écran Mapping — colonnes CSV
    // détectées + option "Ignorer" (aucune valeur pour ce champ).
    columnOptions() {
      return [
        { title: '— Ignore —', value: null },
        ...this.csvHeaders.map(h => ({ title: h, value: h })),
      ]
    },
    mappingGroups() {
      const byGroup = {}
      for (const f of MENU_ITEM_FIELDS) {
        if (!byGroup[f.group]) byGroup[f.group] = []
        byGroup[f.group].push(f)
      }
      return Object.keys(byGroup).map(key => ({
        key,
        label: MAPPING_GROUP_LABELS[key] || key,
        fields: byGroup[key],
      }))
    },
    // BUG-112 : applique `mapping` aux lignes brutes pour reconstituer les objets
    // { fieldKey: valeur } que le reste du composant consomme déjà (rowResolutions,
    // buildPayload, etc. n'ont pas besoin de savoir que le mapping est maintenant manuel).
    mappedRawRows() {
      if (!this.csvHeaders.length) return []
      const colIndex = {}
      for (const f of MENU_ITEM_FIELDS) {
        const header = this.mapping[f.key]
        colIndex[f.key] = header ? this.csvHeaders.indexOf(header) : -1
      }
      return this.rawRows.map(values => {
        const obj = {}
        for (const f of MENU_ITEM_FIELDS) {
          const idx = colIndex[f.key]
          obj[f.key] = idx >= 0 ? String(values[idx] ?? '').trim() : ''
        }
        return obj
      })
    },
    csvRows() {
      return groupCsvRows(this.mappedRawRows)
    },
    // BUG-86 : noms (normalisés) des menu items déjà présents dans le store, pour détecter
    // les doublons au réimport sans renvoyer silencieusement les mêmes lignes au backend.
    existingMenuItemNames() {
      const rows = this.$store?.getters?.['menuItems/rows'] || []
      return new Set(rows.map(r => this.normalizeName(r?.name)))
    },
    // BUG-87 : chaque ligne nommée est résolue (type puis catégorie scopée par ce type) ;
    // une ligne dont le nom, le type OU la catégorie ne se résout pas devient invalide avec
    // un motif explicite, au lieu de produire un item incomplet sans FK.
    rowResolutions() {
      return this.csvRows.map(row => {
        if (!row.name) return { row, valid: false, reason: 'Nom manquant' }
        const tc = this.resolveTypeCategory(row)
        if (!tc.valid) return { row, valid: false, reason: tc.reason }
        return { row, valid: true, typeObj: tc.typeObj, catObj: tc.catObj }
      })
    },
    validRows() {
      return this.rowResolutions
        .filter(r => r.valid)
        .map(r => r.row)
        .filter(row => !this.existingMenuItemNames.has(this.normalizeName(row.name)))
    },
    invalidRows() { return this.rowResolutions.filter(r => !r.valid) },
    // BUG-86 : lignes par ailleurs valides mais dont le nom correspond déjà à un menu item
    // existant — exclues de l'import et listées séparément comme "déjà existantes".
    duplicateRows() {
      return this.rowResolutions
        .filter(r => r.valid)
        .map(r => r.row)
        .filter(row => this.existingMenuItemNames.has(this.normalizeName(row.name)))
    },
    // BUG-112 : n'affiche dans l'aperçu que les champs réellement mappés à une colonne
    // (avant, se basait sur les clés présentes dans csvRows — désormais toujours toutes
    // présentes puisque mappedRawRows peuple systématiquement chaque champ, mappé ou non).
    visibleColumns() {
      return MENU_ITEM_FIELDS.filter(f => this.mapping[f.key])
    },
    previewRows() { return this.validRows.slice(0, 5) },
    // BUG-107 : lookups nom→id pour résoudre les lignes de recette et les référentiels
    // Brand/DisplayName/Space PAR NOM (portable d'un compte à l'autre), au lieu des ids
    // internes du compte source (jamais valides dans le compte cible).
    ingredientNameToId() {
      const map = new Map()
      const rawList = this.$store.getters['marketPriceIngredients/rows'] || []
      for (const mp of rawList) {
        const ingredients = mp?.ingredients || mp?.ingredientList || mp?.items || mp?.data?.ingredients || []
        for (const ing of (Array.isArray(ingredients) ? ingredients : [])) {
          const id = String(
            ing?.id ?? ing?._id ?? ing?.ingredientId ?? ing?.ingredient_id ??
            ing?.ingredient?.id ?? ing?.ingredient?._id ?? ''
          ).trim()
          const name = String(ing?.name ?? ing?.itemName ?? ing?.ingredientName ?? ing?.label ?? '').trim().toLowerCase()
          if (id && name && !map.has(name)) map.set(name, id)
        }
      }
      return map
    },
    componentNameToId() {
      const map = new Map()
      for (const c of (this.$store.getters['menuComponents/rows'] || [])) {
        const id = String(c?.id ?? '').trim()
        const name = String(c?.name ?? '').trim().toLowerCase()
        if (id && name && !map.has(name)) map.set(name, id)
      }
      return map
    },
    packagingNameToId() {
      const map = new Map()
      for (const p of (this.$store.getters['packaging/rows'] || [])) {
        const id = String(p?.id ?? '').trim()
        const name = String(p?.name ?? p?.marketPrice?.itemName ?? '').trim().toLowerCase()
        if (id && name && !map.has(name)) map.set(name, id)
      }
      return map
    },
    // BUG-112 : inclut aussi createdBrands (créées PENDANT cet import) — sinon une marque
    // tout juste auto-créée pour la ligne 1 ne serait pas retrouvée pour la ligne 5 qui la
    // référence aussi, avant que le store n'ait été rafraîchi.
    brandNameToId() {
      const map = new Map()
      for (const b of [...(this.$store.getters['brandNames/brandNames'] || []), ...this.createdBrands]) {
        const id = String(b?.id ?? '').trim()
        const name = String(b?.name ?? '').trim().toLowerCase()
        if (id && name) map.set(name, id)
      }
      return map
    },
    displayNameToId() {
      const map = new Map()
      for (const d of [...(this.$store.getters['displayNames/displayNames'] || []), ...this.createdDisplayNames]) {
        const id = String(d?.id ?? '').trim()
        const name = String(d?.name ?? '').trim().toLowerCase()
        if (id && name) map.set(name, id)
      }
      return map
    },
    spaceNameToId() {
      const map = new Map()
      for (const s of (this.$store.getters['spaces/spaces'] || [])) {
        const id = String(s?.id ?? s?._id ?? '').trim()
        const name = String(s?.name ?? s?.title ?? s?.label ?? '').trim().toLowerCase()
        if (id && name) map.set(name, id)
      }
      return map
    },
    // Format "Recipe" packé du fichier historique (voir parseRecipe()) : les refs peuvent déjà
    // être de vrais ids de ce tenant (round-trip après un futur export packé) — Sets pour la
    // résolution priorité (a), avant de retomber sur les fichiers compagnons / l'auto-référence.
    ingredientValidIds() {
      return new Set(this.ingredientNameToId.values())
    },
    packagingValidIds() {
      return new Set(this.packagingNameToId.values())
    },
    componentValidIds() {
      return new Set(this.componentNameToId.values())
    },
    // MenuItem existants du compte cible, par nom — pour résoudre l'auto-référence "Combo Item"
    // (une ligne référence un autre MenuItem, soit une autre ligne de CE fichier, soit un item
    // déjà présent dans ce tenant).
    menuItemNameToId() {
      const map = new Map()
      for (const m of (this.$store.getters['menuItems/rows'] || [])) {
        const id = String(m?.id ?? '').trim()
        const name = String(m?.name ?? '').trim().toLowerCase()
        if (id && name && !map.has(name)) map.set(name, id)
      }
      return map
    },
    // Map "Menu Item ID" (colonne CSV, id legacy) -> Name, construite depuis TOUTES les lignes du
    // fichier — permet de résoudre une auto-référence "Combo Item" vers une AUTRE ligne du même
    // CSV, quel que soit l'ordre (une ligne peut référencer une ligne définie plus loin).
    csvIdToName() {
      const map = new Map()
      for (const row of this.mappedRawRows) {
        if (row.csvId && row.name) map.set(row.csvId, row.name)
      }
      return map
    },
    // Lignes de recette (Ingredient/Component/Packaging) dont le nom ne correspond à rien
    // dans le compte cible — l'article est quand même créé, juste sans cette ligne précise.
    // Affiché à l'utilisateur pour qu'il sache quoi créer/renommer avant de réessayer.
    unresolvedRecipeLines() {
      const out = []
      for (const row of this.validRows) {
        if (row.recipeLines?.length) out.push(...this.resolveRecipeLines(row).unresolved)
        // Format legacy packé (fichier historique) : seuls Ingredient/Packaging sont prévisibles
        // ici (résolution par nom/fichier compagnon, statique) — Component/Combo Item peuvent
        // dépendre d'un item créé PENDANT cet import (auto-référence), leur statut définitif
        // n'est connu qu'après la passe 2 de runImport() (cf. unresolvedComboRefs, étape Résultat).
        else if (row.recipe) out.push(...this.resolveLegacyRecipe(row).unresolved)
      }
      return out
    },
    // BUG-112 : référentiels (Type/Category/Brand/Display Name) mentionnés dans le fichier
    // mais absents du compte cible — seront créés automatiquement à l'import (PAS pour les
    // lignes de recette Ingredient/Component/Packaging, qui nécessitent un coût/une unité
    // qu'un simple nom ne permet pas de déduire — celles-là restent seulement signalées,
    // cf. unresolvedRecipeLines). Informatif, PAS une erreur bloquante.
    pendingCreations() {
      const isEmptyMarker = (v) => !v || v === '-'
      const types = new Map(), categories = new Map(), brands = new Map(), displayNames = new Map()
      const allTypes = [...(this.productTypes || []), ...this.createdTypes]
      const allCategories = [...(this.productCategories || []), ...this.createdCategories]
      for (const row of this.validRows) {
        const typeName = String(row.type || '').trim()
        const typeExists = !isEmptyMarker(typeName)
          && allTypes.some(t => String(t.name || '').toLowerCase() === typeName.toLowerCase())
        if (!isEmptyMarker(typeName) && !typeExists) types.set(typeName.toLowerCase(), typeName)

        const categoryName = String(row.category || '').trim()
        if (!isEmptyMarker(categoryName) && !isEmptyMarker(typeName)) {
          const typeObj = allTypes.find(t => String(t.name || '').toLowerCase() === typeName.toLowerCase())
          const typeKey = typeObj && (typeObj.id || typeObj._id)
          const categoryExists = allCategories.some(
            c => c.typeId === typeKey && String(c.name || '').toLowerCase() === categoryName.toLowerCase()
          )
          if (!categoryExists) categories.set(`${typeName.toLowerCase()}::${categoryName.toLowerCase()}`, { type: typeName, category: categoryName })
        }

        const brandName = String(row.brand || '').trim()
        if (!isEmptyMarker(brandName) && !this.brandNameToId.has(brandName.toLowerCase())) {
          brands.set(brandName.toLowerCase(), brandName)
        }
        const displayName = String(row.displayNameRef || '').trim()
        if (!isEmptyMarker(displayName) && !this.displayNameToId.has(displayName.toLowerCase())) {
          displayNames.set(displayName.toLowerCase(), displayName)
        }
      }
      return {
        types: [...types.values()],
        categories: [...categories.values()],
        brands: [...brands.values()],
        displayNames: [...displayNames.values()],
      }
    },
    pendingCreationsCount() {
      const p = this.pendingCreations
      return p.types.length + p.categories.length + p.brands.length + p.displayNames.length
    },
    autoCreatedSummary() {
      const parts = []
      if (this.createdTypes.length) parts.push(`${this.createdTypes.length} type(s)`)
      if (this.createdCategories.length) parts.push(`${this.createdCategories.length} category(ies)`)
      if (this.createdBrands.length) parts.push(`${this.createdBrands.length} brand(s)`)
      if (this.createdDisplayNames.length) parts.push(`${this.createdDisplayNames.length} display name(s)`)
      return parts.join(', ')
    },
  },

  watch: {
    modelValue(v) {
      if (v) {
        this.reset()
        // La déduplication (existingMenuItemNames) lit menuItems/rows : s'assurer que le
        // catalogue complet est chargé même si l'écran liste a démarré en mode paginé rapide
        // (qui ne charge plus tout le catalogue par défaut).
        this.$store.dispatch('menuItems/fetchMenuItems', {})
        // BUG-107 : résolution des lignes de recette (Ingredient/Component/Packaging) et des
        // référentiels Brand/DisplayName par NOM — nécessite ces listes en mémoire.
        this.$store.dispatch('marketPriceIngredients/fetchRows', {})
        this.$store.dispatch('packaging/fetchPackaging', {})
        this.$store.dispatch('menuComponents/fetchComponents', {})
        this.$store.dispatch('brandNames/fetchBrandNames', {})
        this.$store.dispatch('displayNames/fetchDisplayNames', {})
        this.$store.dispatch('spaces/fetchSpaces', {})
      }
    },
  },

  methods: {
    dotClass(i) {
      if (this.step > i + 1) return 'mi-dot--done'
      if (this.step === i + 1) return 'mi-dot--active'
      return ''
    },
    reset() {
      this.step = 1
      this.dropping = false
      this.fileName = ''
      this.csvHeaders = []
      this.rawRows = []
      this.mapping = {}
      this.emptyParseWarning = ''
      this.importing = false
      this.importError = ''
      this.importedCount = 0
      this.importFailed = []
      this.importBulkCountUnknown = false
      this.showInvalidDetail = false
      this.showDuplicateDetail = false
      this.showUnresolvedDetail = false
      this.createdTypes = []
      this.createdCategories = []
      this.createdBrands = []
      this.createdDisplayNames = []
    },
    close() { this.$emit('update:modelValue', false) },
    onDrop(e) {
      this.dropping = false
      const file = e.dataTransfer?.files?.[0]
      if (file) this.loadFile(file)
    },
    onFileChange(e) {
      const file = e.target?.files?.[0]
      if (file) this.loadFile(file)
      e.target.value = ''
    },
    loadFile(file) {
      this.fileName = file.name
      const reader = new FileReader()
      reader.onload = e => {
        const { headers, dataRows } = parseCsvRaw(e.target.result)
        this.csvHeaders = headers
        this.rawRows = dataRows
        // BUG-88 : fichier réellement vide (aucune ligne de données après l'en-tête).
        this.emptyParseWarning = dataRows.length === 0 ? 'Fichier vide.' : ''
        this.autoMapFields()
        this.step = 2 // Mapping (BUG-112)
      }
      reader.readAsText(file, 'UTF-8')
    },
    onCompanionMarketPricesChange(e) {
      const file = e.target?.files?.[0]
      if (file) {
        this.companionMarketPricesFileName = file.name
        const reader = new FileReader()
        reader.onload = ev => { this.companionMarketPricesMap = parseCompanionMarketPrices(ev.target.result) }
        reader.readAsText(file, 'UTF-8')
      }
      e.target.value = ''
    },
    onCompanionComponentsChange(e) {
      const file = e.target?.files?.[0]
      if (file) {
        this.companionComponentsFileName = file.name
        const reader = new FileReader()
        reader.onload = ev => { this.companionComponentsMap = parseCompanionComponents(ev.target.result) }
        reader.readAsText(file, 'UTF-8')
      }
      e.target.value = ''
    },
    // BUG-112 : auto-mapping par alias d'en-tête (réutilise HEADER_MAP existant), corrigible
    // ensuite manuellement à l'écran Mapping — même principe que
    // MarketPriceCsvImportDrawer.autoMap().
    autoMapFields() {
      const newMapping = {}
      for (const f of MENU_ITEM_FIELDS) newMapping[f.key] = null
      for (const header of this.csvHeaders) {
        const fieldKey = HEADER_MAP[header.toLowerCase().trim()]
        if (fieldKey && !newMapping[fieldKey]) newMapping[fieldKey] = header
      }
      // Fichier historique où "Name" ET "Display Name" sont deux colonnes réellement distinctes
      // (contrairement à l'alias legacy 'display name' → name ci-dessus, pensé pour un export où
      // "Display Name" est le seul nom de l'article) : si "Name" a déjà capté le field `name`,
      // une colonne "Display Name" restée non consommée devient `displayNameRef` plutôt que de
      // rester non mappée.
      if (newMapping.name && !newMapping.displayNameRef) {
        const displayNameHeader = this.csvHeaders.find(h => h.toLowerCase().trim() === 'display name')
        if (displayNameHeader && displayNameHeader !== newMapping.name) {
          newMapping.displayNameRef = displayNameHeader
        }
      }
      this.mapping = newMapping
    },
    setMapping(key, val) {
      this.mapping = { ...this.mapping, [key]: val }
    },
    // Modèle CSV téléchargeable — même pattern que MarketPriceCsvImportDrawer.vue
    // (downloadTemplate). Exemple avec 2 lignes de recette pour illustrer le format
    // multi-lignes (BUG-107/108) : ces 2 lignes CSV représentent UN SEUL article.
    downloadTemplate() {
      const headers = [
        'Name', 'Type', 'Category', 'Price TTC', 'VAT %', 'Ready for Sale', 'Combo Item',
        'Brand', 'Kitchen Type', 'Number of Pieces (Recipe)', 'Storage Type', 'Diet', 'Description',
        'Line Type', 'Line Item Name', 'Line Quantity',
      ]
      const rows = [
        ['Classic Burger', 'Food', 'Burgers', '12.50', '10', 'Yes', 'No', '', 'Central', '1', 'Cold', '', 'Beef burger with cheese', 'Ingredient', 'Beef Patty', '1'],
        ['Classic Burger', 'Food', 'Burgers', '12.50', '10', 'Yes', 'No', '', 'Central', '1', 'Cold', '', 'Beef burger with cheese', 'Ingredient', 'Burger Bun', '1'],
      ]
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'menu_items_template.csv'
      a.click()
      URL.revokeObjectURL(url)
    },
    // BUG-86 : normalisation nom (casse/espaces) pour comparer une ligne CSV à un menu item
    // déjà en base.
    normalizeName(name) {
      return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
    },
    // BUG-87 : résout le type par nom, PUIS la catégorie filtrée par le typeId résolu (comme
    // MenuItemCreateView.filteredCategoryNames) — jamais un match de catégorie sur le nom
    // seul, qui pourrait associer la catégorie d'un autre type portant le même nom.
    // BUG-110 : type/catégorie sont OPTIONNELS côté backend (CreateMenuItemDto) — un article
    // sans type/catégorie existe réellement en base (affiché "-" dans la liste/l'export, cf.
    // MenuItemView.mapItemToRow). "" ou "-" en entrée = valide, article créé sans FK, PAS une
    // erreur. Seul un nom NON VIDE qui ne correspond à aucun type/catégorie connu (vraie faute
    // de frappe / référentiel différent) reste une erreur bloquante pour la ligne.
    // BUG-112 : un type/catégorie NON VIDE qui ne correspond à rien n'est plus une erreur
    // bloquante — il sera créé automatiquement à l'import (cf. pendingCreations/
    // scanAndCreateMissingReferentials), comme MarketPriceCsvImportDrawer le fait déjà pour
    // Good Type/Category/Supplier/Industrial. typeObj/catObj restent null si non résolus —
    // buildPayload gère ce cas (FK omise si la création automatique venait à échouer).
    resolveTypeCategory(row) {
      const typeName = String(row.type || '').trim()
      const categoryName = String(row.category || '').trim()
      const isEmptyMarker = (v) => !v || v === '-'
      const allTypes = [...(this.productTypes || []), ...this.createdTypes]
      const allCategories = [...(this.productCategories || []), ...this.createdCategories]

      if (isEmptyMarker(typeName)) return { valid: true, typeObj: null, catObj: null }
      const typeObj = allTypes.find(t => String(t.name || '').toLowerCase() === typeName.toLowerCase()) || null
      const typeKey = typeObj && (typeObj.id || typeObj._id)

      if (isEmptyMarker(categoryName) || !typeKey) return { valid: true, typeObj, catObj: null }
      const catObj = allCategories.find(
        c => c.typeId === typeKey && String(c.name || '').toLowerCase() === categoryName.toLowerCase()
      ) || null
      return { valid: true, typeObj, catObj }
    },
    // BUG-107 : résout chaque ligne de recette (Ingredient/Component/Packaging) PAR NOM contre
    // le référentiel du compte cible. Une ligne non résolue est simplement omise (l'article
    // est quand même créé) et remontée dans `unresolved` pour affichage — pas de rejet de
    // l'article entier pour une seule ligne de recette introuvable.
    resolveRecipeLines(row) {
      const ingredients = [], components = [], packagings = [], unresolved = []
      for (const line of (row.recipeLines || [])) {
        const qty = Number(line.qty) || 0
        if (!qty) continue
        const key = String(line.name || '').trim().toLowerCase()
        const type = String(line.type || '').trim().toLowerCase()
        if (type === 'ingredient') {
          const id = this.ingredientNameToId.get(key)
          if (id) ingredients.push({ ingredientId: id, numberOfUnits: qty })
          else unresolved.push({ item: row.name, type: 'Ingredient', name: line.name })
        } else if (type === 'component') {
          const id = this.componentNameToId.get(key)
          if (id) components.push({ componentId: id, numberOfUnits: qty })
          else unresolved.push({ item: row.name, type: 'Component', name: line.name })
        } else if (type === 'packaging') {
          const id = this.packagingNameToId.get(key)
          if (id) packagings.push({ packagingId: id, numberOfUnits: qty })
          else unresolved.push({ item: row.name, type: 'Packaging', name: line.name })
        }
      }
      return { ingredients, components, packagings, unresolved }
    },
    // Résout la colonne "Recipe" packée du fichier historique (parseRecipe() ne retourne que des
    // refs brutes, jamais résolues — voir sa doc). Ingredient/Packaging : priorité (a) id réel
    // déjà existant dans ce tenant, (b) fichier compagnon Market Prices (ancien id -> Item Name
    // -> nom résolu), (c) non résolu. Component/Combo Item : même cascade mais avec le fichier
    // compagnon Components à l'étape (b) ; si toujours non résolu, DÉFÉRÉ à la passe 2 de
    // runImport() (`comboItems`, résolu soit par un vrai MenuItem.id déjà existant, soit par
    // auto-référence vers une autre ligne de ce même fichier — les deux nécessitent des données
    // qui ne sont sûres qu'une fois toutes les lignes créées/mises à jour).
    resolveLegacyRecipe(row) {
      const { ingredientRefs, packagingRefs, comboRefs } = parseRecipe(row.recipe)
      const ingredients = [], packagings = [], components = [], comboItems = [], unresolved = []

      for (const ref of ingredientRefs) {
        let id
        if (this.ingredientValidIds.has(ref.refId)) id = ref.refId
        else if (this.companionMarketPricesMap?.has(ref.refId)) {
          const itemName = this.companionMarketPricesMap.get(ref.refId)
          id = this.ingredientNameToId.get(String(itemName).trim().toLowerCase())
        }
        if (id) ingredients.push({ ingredientId: id, numberOfUnits: ref.quantity })
        else unresolved.push({ item: row.name, type: 'Ingredient', name: ref.refId })
      }

      for (const ref of packagingRefs) {
        let id
        if (this.packagingValidIds.has(ref.refId)) id = ref.refId
        else if (this.companionMarketPricesMap?.has(ref.refId)) {
          const itemName = this.companionMarketPricesMap.get(ref.refId)
          id = this.packagingNameToId.get(String(itemName).trim().toLowerCase())
        }
        if (id) packagings.push({ packagingId: id, numberOfUnits: ref.quantity })
        else unresolved.push({ item: row.name, type: 'Packaging', name: ref.refId })
      }

      for (const ref of comboRefs) {
        if (this.componentValidIds.has(ref.refId)) {
          components.push({ componentId: ref.refId, numberOfUnits: ref.quantity })
          continue
        }
        if (this.companionComponentsMap?.has(ref.refId)) {
          const componentName = this.companionComponentsMap.get(ref.refId)
          const id = this.componentNameToId.get(String(componentName).trim().toLowerCase())
          if (id) { components.push({ componentId: id, numberOfUnits: ref.quantity }); continue }
        }
        comboItems.push({ refId: ref.refId, quantity: ref.quantity })
      }

      return { ingredients, packagings, components, comboItems, unresolved }
    },
    buildPayload(row) {
      const { typeObj, catObj } = this.resolveTypeCategory(row)
      const payload = {
        name: row.name,
        basePrice: Number(row.basePrice) || 0,
      }
      // BUG-110 : typeObj/catObj peuvent être null (article légitimement sans type/catégorie) —
      // typeId/categoryId sont optionnels côté backend, on ne les envoie que si résolus.
      if (typeObj) payload.typeId = typeObj.id || typeObj._id
      if (catObj)  payload.categoryId = catObj.id || catObj._id
      if (row.readyForSale) payload.readyForSale = toBool(row.readyForSale) ? 'Yes' : 'No'
      if (row.comboItem)    payload.comboItem    = toBool(row.comboItem) ? 'Yes' : 'No'
      if (row.description)  payload.description  = row.description
      if (row.kitchenType)  payload.kitchenType  = row.kitchenType
      if (row.numberOfPiecesRecipe) {
        payload.numberOfPiecesRecipe = Math.max(1, Math.round(Number(row.numberOfPiecesRecipe) || 1))
      }
      if (row.discountType)  payload.discountType  = row.discountType
      if (row.discountValue) payload.discountValue = Number(row.discountValue) || 0
      if (row.vatRate)       payload.vatRate       = Number(row.vatRate) || undefined
      if (row.storageType) {
        payload.storageType = String(row.storageType).split(';').map(s => s.trim()).filter(Boolean)
      }
      if (row.diet) {
        payload.diet = String(row.diet).split(';').map(s => s.trim()).filter(Boolean)
      }
      if (row.brand) {
        const brandId = this.brandNameToId.get(String(row.brand).trim().toLowerCase())
        if (brandId) payload.brandId = brandId
      }
      if (row.displayNameRef) {
        const displayNameId = this.displayNameToId.get(String(row.displayNameRef).trim().toLowerCase())
        if (displayNameId) payload.displayNameId = displayNameId
      }
      if (row.space) {
        const spaceIds = String(row.space).split(';').map(s => s.trim()).filter(Boolean)
          .map(n => this.spaceNameToId.get(n.toLowerCase()))
          .filter(Boolean)
        if (spaceIds.length) payload.spaceIds = spaceIds
      }
      if (row.inventoryPackagingType) payload.inventoryPackagingType = row.inventoryPackagingType
      if (row.inventoryNumberOfUnits) payload.inventoryNumberOfUnits = Number(row.inventoryNumberOfUnits) || undefined
      // Nouveau format multi-lignes (Line Type/Line Item Name, BUG-108) — prioritaire s'il est
      // présent. Sinon, ancien format "Recipe" packé du fichier historique, résolu par nom via
      // les fichiers compagnons (voir resolveLegacyRecipe()) — plus jamais envoyé en ID brut.
      if (row.recipe) {
        const { ingredients, packagings, components, comboItems } = this.resolveLegacyRecipe(row)
        if (ingredients.length) payload.ingredients = ingredients
        if (packagings.length)  payload.packagings  = packagings
        if (components.length)  payload.components  = components
        // Jamais envoyé au backend tel quel (pas un champ du DTO) — consommé et retiré par
        // runImport() avant l'appel API, pour la résolution en passe 2 (auto-référence MenuItem).
        if (comboItems.length) payload._pendingComboRefs = comboItems
      }
      if (row.recipeLines?.length) {
        const { ingredients, components, packagings } = this.resolveRecipeLines(row)
        if (ingredients.length) payload.ingredients = ingredients
        if (components.length)  payload.components  = components
        if (packagings.length)  payload.packagings  = packagings
      }
      return payload
    },
    // BUG-112 : crée réellement en base les Types/Categories/Brands/Display Names détectés
    // comme manquants (cf. computed pendingCreations) — UNE SEULE FOIS par nom pour tout le
    // fichier, avant le traitement ligne par ligne. Types créés avant Categories (dépendance
    // typeId). Même pattern que MarketPriceCsvImportDrawer.createMissingEntities(), en plus
    // simple : pas de détection de faute de frappe/confirmation ambiguë (scope volontairement
    // réduit) — un nom non trouvé exactement est directement traité comme nouveau.
    // Échec de création isolé (catch vide) : la ligne concernée sera simplement créée sans
    // cette FK plus tard (typeObj/catObj/brandId/displayNameId resteront non résolus).
    async scanAndCreateMissingReferentials() {
      const { types, categories, brands, displayNames } = this.pendingCreations
      for (const name of types) {
        try {
          const res = await createProductType({ name })
          const created = res?.data || res
          const id = created?.id || created?._id
          if (id) {
            this.createdTypes.push({ ...created, id, name })
            this.$store.dispatch('productTypes/addProductType', { ...created, id, name })
          }
        } catch (e) { /* la ligne sera créée sans ce type, faute de résolution */ }
      }
      for (const { type, category } of categories) {
        const typeObj = [...(this.productTypes || []), ...this.createdTypes]
          .find(t => String(t.name || '').toLowerCase() === type.toLowerCase())
        const typeId = typeObj && (typeObj.id || typeObj._id)
        if (!typeId) continue // le type lui-même n'a pas pu être résolu/créé
        try {
          const res = await createProductCategory({ name: category, typeId })
          const created = res?.data || res
          const id = created?.id || created?._id
          if (id) {
            this.createdCategories.push({ ...created, id, name: category, typeId })
            this.$store.dispatch('productCategories/addProductCategory', { ...created, id, name: category, typeId })
          }
        } catch (e) { /* idem */ }
      }
      for (const name of brands) {
        try {
          const res = await createBrandName({ name })
          const created = res?.data || res
          const id = created?.id || created?._id
          if (id) {
            this.createdBrands.push({ ...created, id, name })
            this.$store.dispatch('brandNames/addBrandName', { ...created, id, name })
          }
        } catch (e) { /* idem */ }
      }
      for (const name of displayNames) {
        try {
          const res = await createDisplayName({ name })
          const created = res?.data || res
          const id = created?.id || created?._id
          if (id) {
            this.createdDisplayNames.push({ ...created, id, name })
            this.$store.dispatch('displayNames/addDisplayName', { ...created, id, name })
          }
        } catch (e) { /* idem */ }
      }
    },
    async runImport() {
      this.step = 4
      this.importing = true
      this.importError = ''
      this.importFailed = []
      this.importBulkCountUnknown = false
      this.createdTypes = []
      this.createdCategories = []
      this.createdBrands = []
      this.createdDisplayNames = []
      try {
        // BUG-112 : crée d'abord les référentiels manquants détectés dans validRows, pour que
        // buildPayload() (juste après) puisse résoudre typeId/categoryId/brandId/displayNameId
        // fraîchement créés en plus de ceux déjà existants.
        await this.scanAndCreateMissingReferentials()
        // validRows exclut déjà les doublons déjà en base (BUG-86) — ce qui suit n'envoie que
        // des lignes importables (type/catégorie non résolus ne bloquent plus, BUG-112).
        const allItems = this.validRows.map(r => this.buildPayload(r))

        const hasRecipe = item =>
          item.ingredients?.length || item.components?.length || item.packagings?.length

        const withRecipe    = allItems.filter(hasRecipe)
        const withoutRecipe = allItems.filter(item => !hasRecipe(item))

        let totalCreated = 0

        // Bulk pour les items sans recipe (efficace)
        if (withoutRecipe.length) {
          const res = await bulkCreateMenuItems(withoutRecipe)
          const count = res?.data?.count ?? res?.count
          // BUG-85 : si l'endpoint bulk ne renvoie pas de count exploitable, on ne suppose
          // plus un succès total (ancien repli `?? withoutRecipe.length`) — on le signale
          // explicitement à l'utilisateur à l'étape Résultat à la place.
          if (typeof count === 'number') {
            totalCreated += count
          } else {
            this.importBulkCountUnknown = true
          }
        }

        // Individuel pour les items avec recipe — le endpoint single traite les
        // ingrédients/composants/packagings. BUG-85 : try/catch PAR item pour qu'un échec
        // isolé n'efface pas les succès déjà obtenus (avant : une exception ici remontait
        // au catch global et affichait "Import error" alors que des items avaient bien été
        // créés en base).
        for (const item of withRecipe) {
          try {
            await createMenuItem(item)
            totalCreated++
          } catch (e) {
            this.importFailed.push({ name: item.name || '(sans nom)', message: e?.message || 'Erreur inconnue' })
          }
        }

        this.importedCount = totalCreated
        this.$emit('imported')
      } catch (e) {
        this.importError = e?.message || 'Une erreur est survenue lors de l\'import.'
      } finally {
        this.importing = false
      }
    },
  },
}
</script>

<style scoped>
/* ── Shell ───────────────────────────────────────────────── */
/* Overlay + panel "faits maison" (Teleport, comme MarketPriceCsvImportDrawer.vue) au lieu
   d'un <v-navigation-drawer> Vuetify : le scrim de ce dernier ne couvrait pas toute la
   largeur de l'écran (s'arrêtait avant la barre latérale gauche) — signalé par l'utilisateur,
   capture à l'appui. position:fixed; inset:0 garantit une couverture plein écran réelle. */
.mi-import-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
}
.mi-import-panel {
  width: 580px;
  max-width: 100vw;
  height: 100%;
  background: #ffffff;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mi-import--dark.mi-import-panel {
  background: #111827;
}
.mi-import-enter-active,
.mi-import-leave-active {
  transition: opacity 0.25s ease;
}
.mi-import-enter-active .mi-import-panel,
.mi-import-leave-active .mi-import-panel {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.mi-import-enter-from,
.mi-import-leave-to {
  opacity: 0;
}
.mi-import-enter-from .mi-import-panel,
.mi-import-leave-to .mi-import-panel {
  transform: translateX(100%);
}

/* ── Header ──────────────────────────────────────────────── */
.mi-header {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49,.2);
}
.mi-header__icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.mi-header__text { flex: 1; }
.mi-header__title { font-size: 15px; font-weight: 700; color: #fff; }
.mi-header__sub { font-size: 12px; color: rgba(255,255,255,.72); margin-top: 2px; }
.mi-header__close {
  background: rgba(255,255,255,.15); border: none; cursor: pointer;
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; transition: background .15s;
}
.mi-header__close:hover { background: rgba(255,255,255,.25); }

/* ── Typography ──────────────────────────────────────────── */
.mi-title   { color: #111827; }
.mi-subtitle { color: #6b7280; }
.mi-import--dark .mi-title    { color: #f1f5f9; }
.mi-import--dark .mi-subtitle { color: #94a3b8; }

/* ── Divider ─────────────────────────────────────────────── */
.mi-divider { border-color: #f1f5f9 !important; }
.mi-import--dark .mi-divider { border-color: #1e293b !important; }

/* ── Step bar ────────────────────────────────────────────── */
.mi-stepbar { background: #ffffff; }
.mi-import--dark .mi-stepbar { background: #111827; }

.mi-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  background: #e5e7eb;
  color: #9ca3af;
  transition: background 0.2s, color 0.2s;
}
.mi-import--dark .mi-dot {
  background: #374151;
  color: #6b7280;
}
.mi-dot--active {
  background: #ff3131 !important;
  color: #ffffff !important;
}
.mi-dot--done {
  background: #16a34a !important;
  color: #ffffff !important;
}

.mi-step-label {
  font-size: 12px;
  white-space: nowrap;
}
.mi-step-label--active { font-weight: 600; }
.mi-step-label--inactive { color: #9ca3af; }
.mi-import--dark .mi-step-label--inactive { color: #4b5563; }

.mi-step-line {
  flex: 1;
  height: 1.5px;
  background: #e5e7eb;
  margin: 0 8px;
  min-width: 16px;
  transition: background 0.2s;
}
.mi-import--dark .mi-step-line { background: #374151; }
.mi-step-line--done { background: #16a34a !important; }

/* ── Body ────────────────────────────────────────────────── */
.mi-body {
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* Step 1 (upload) : occupe toute la hauteur disponible du corps du tiroir au lieu de
   laisser un grand vide sous la dropzone — seul ce step utilise flex:1 ici (le format hint
   garde sa hauteur naturelle en bas) ; steps 2/3 (aperçu/résultat) restent en flux normal. */
.mi-step1 {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* ── Dropzone ────────────────────────────────────────────── */
.mi-dropzone {
  border: 2px dashed #d1d5db;
  border-radius: 16px;
  cursor: pointer;
  padding: 48px 24px;
  background: #f9fafb;
  transition: border-color 0.2s, background 0.2s;
  flex: 1;
  min-height: 220px;
}
.mi-import--dark .mi-dropzone {
  border-color: #374151;
  background: #1e293b;
}
.mi-dropzone--hover,
.mi-dropzone:hover {
  border-color: #ff3131;
  background: #fff5f5;
}
.mi-import--dark .mi-dropzone--hover,
.mi-import--dark .mi-dropzone:hover {
  border-color: #ff3131;
  background: rgba(255, 49, 49, 0.08);
}

.mi-dropzone-icon { color: #9ca3af; }
.mi-import--dark .mi-dropzone-icon { color: #4b5563; }
.mi-dropzone:hover .mi-dropzone-icon,
.mi-dropzone--hover .mi-dropzone-icon { color: #ff3131; }

/* ── Hint card ───────────────────────────────────────────── */
.mi-hint-card {
  background: #f9fafb !important;
  border: 1px solid #e5e7eb !important;
}
.mi-import--dark .mi-hint-card {
  background: #1e293b !important;
  border-color: #374151 !important;
}
.mi-hint-icon { color: #9ca3af; }
.mi-import--dark .mi-hint-icon { color: #6b7280; }

/* ── File bar ────────────────────────────────────────────── */
.mi-file-bar {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
}
.mi-import--dark .mi-file-bar {
  background: #1e293b;
  border-color: #374151;
}

/* ── Skip / dedup / failure lists (BUG-85/86/87 récapitulatifs) ──────── */
.mi-skip-list {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  max-height: 160px;
  overflow-y: auto;
}
.mi-import--dark .mi-skip-list {
  background: #1e293b;
  border-color: #374151;
}

/* BUG-111 : toggle "Voir/Masquer le détail" dans les bandeaux d'avertissement — évite
   d'imposer une longue liste sans action possible dessus par défaut. */
.mi-detail-toggle {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 600;
  text-decoration: underline;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  opacity: 0.85;
}
.mi-detail-toggle:hover { opacity: 1; }

/* ── Mapping (BUG-112) ──────────────────────────────────────── */
.mi-mapping-group-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9ca3af;
  margin-bottom: 8px;
}
.mi-import--dark .mi-mapping-group-label { color: #6b7280; }
.mi-mapping-label {
  flex: 0 0 190px;
  font-size: 0.82rem;
  font-weight: 500;
}
.mi-required { color: #ff3131; margin-left: 2px; font-weight: 700; }

/* ── Preview table ───────────────────────────────────────── */
.mi-table-wrap {
  border: 1px solid #e5e7eb;
}
.mi-import--dark .mi-table-wrap {
  border-color: #374151;
}
.mi-preview-table :deep(thead) {
  background: #f3f4f6;
}
.mi-import--dark .mi-preview-table :deep(thead) {
  background: #1f2937 !important;
}
.mi-preview-table :deep(thead th) {
  color: #374151 !important;
  border-bottom: 1px solid #e5e7eb !important;
  padding: 8px 12px !important;
}
.mi-import--dark .mi-preview-table :deep(thead th) {
  color: #94a3b8 !important;
  border-bottom-color: #374151 !important;
}
.mi-preview-table :deep(tbody td) {
  padding: 6px 12px !important;
  color: #374151;
  border-bottom: 1px solid #f3f4f6 !important;
}
.mi-import--dark .mi-preview-table :deep(tbody td) {
  color: #e2e8f0 !important;
  border-bottom-color: #1e293b !important;
  background: #111827 !important;
}
.mi-import--dark .mi-preview-table :deep(.v-table) {
  background: #111827 !important;
}

/* ── Result icons ────────────────────────────────────────── */
.mi-result-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mi-result-icon--success {
  background: rgba(22, 163, 74, 0.12);
  color: #16a34a;
}
.mi-result-icon--error {
  background: rgba(255, 49, 49, 0.12);
  color: #ff3131;
}

/* ── Footer ──────────────────────────────────────────────── */
.mi-footer {
  flex-shrink: 0;
  background: #ffffff;
  border-top: 1px solid #f1f5f9;
}
.mi-import--dark .mi-footer {
  background: #111827;
  border-top-color: #1e293b;
}

/* ── Buttons ─────────────────────────────────────────────── */
.mi-text-btn    { color: #6b7280 !important; }
.mi-outline-btn { border-color: #d1d5db !important; color: #374151 !important; }
.mi-import--dark .mi-text-btn    { color: #9ca3af !important; }
.mi-import--dark .mi-outline-btn { border-color: #374151 !important; color: #e2e8f0 !important; }
</style>
