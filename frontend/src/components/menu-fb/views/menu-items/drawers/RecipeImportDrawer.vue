<template>
  <Teleport to="body">
    <Transition name="rid">
      <div v-if="modelValue" class="rid-overlay" @mousedown.self="close">
        <div class="rid-drawer" :class="{ 'rid--dark': isDark }">
          <!-- Header -->
          <div class="rid-header pa-6">
            <div>
              <div class="text-h6 font-weight-bold">Importer des recettes (CSV)</div>
              <div class="text-body-2 text-medium-emphasis mt-1">
                Associe chaque plat à ses ingrédients depuis un CSV
                (colonnes : <code>plat, ingredient, market_price_id, quantite</code>).
              </div>
            </div>
            <v-btn icon variant="text" density="compact" @click="close"><X :size="18" /></v-btn>
          </div>

          <div class="rid-body pa-6">
            <div v-if="loading" class="text-body-2 text-medium-emphasis">Chargement du catalogue…</div>

            <template v-else>
              <!-- Upload -->
              <input ref="fileInput" type="file" accept=".csv,text/csv" style="display:none" @change="onFileChange" />
              <div class="rid-dropzone d-flex flex-column align-center justify-center pa-8" @click="$refs.fileInput.click()">
                <Upload :size="28" class="mb-2 text-medium-emphasis" />
                <div class="text-body-2">{{ fileName || 'Cliquer pour choisir le CSV' }}</div>
                <div class="text-caption text-medium-emphasis mt-1">
                  {{ menuItems.length }} menu items · {{ ingredients.length }} ingrédients chargés
                </div>
              </div>

              <div v-if="parseError" class="text-error text-body-2 mt-3">{{ parseError }}</div>

              <!-- Analyse -->
              <div v-if="rows.length" class="mt-5">
                <div class="d-flex flex-wrap" style="gap:10px">
                  <span class="rid-chip rid-chip-green">{{ analysis.groups.length }} plat(s) avec recette</span>
                  <span class="rid-chip rid-chip-blue">{{ analysis.readyByMenu.length }} readyForSale</span>
                  <span class="rid-chip rid-chip-blue">{{ analysis.applicable }} ligne(s) applicable(s)</span>
                  <span class="rid-chip rid-chip-amber">{{ analysis.skipped.length }} ignorée(s)</span>
                </div>

                <div v-if="analysis.skipped.length" class="mt-3 rid-skip">
                  <div class="text-caption font-weight-bold mb-1">Ignorées (raison) :</div>
                  <div v-for="(s, i) in analysis.skipped.slice(0, 12)" :key="i" class="text-caption text-medium-emphasis">
                    • {{ s.plat }} → {{ s.ingredient }} : {{ s.reason }}
                  </div>
                  <div v-if="analysis.skipped.length > 12" class="text-caption text-medium-emphasis">
                    … +{{ analysis.skipped.length - 12 }}
                  </div>
                </div>

                <div class="text-caption text-medium-emphasis mt-3">
                  ⚠️ L'import <b>remplace</b> les ingrédients de chaque plat concerné (PUT). Les lignes sans
                  <code>quantite</code> numérique ou sans ingrédient résolu sont ignorées.
                </div>
              </div>

              <!-- Résultat -->
              <div v-if="result" class="mt-4 rid-result">
                <div class="text-body-2">
                  <b>{{ result.rfsOk }}</b> readyForSale màj · <b>{{ result.ok }}</b> recette(s) màj
                  <span v-if="result.fail">· <b class="text-error">{{ result.fail }}</b> échec(s)</span>
                </div>
              </div>
            </template>
          </div>

          <!-- Footer -->
          <div class="rid-footer pa-4">
            <v-btn variant="text" @click="close">Fermer</v-btn>
            <v-spacer />
            <v-btn
              color="#ff3131" variant="flat" class="text-white text-none"
              :disabled="(!analysis.groups.length && !analysis.readyByMenu.length) || applying"
              :loading="applying"
              @click="apply"
            >
              Importer {{ analysis.readyByMenu.length ? '(' + analysis.readyByMenu.length + ')' : '' }}
            </v-btn>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { X, Upload } from 'lucide-vue-next'
import { getAllMenuItems, replaceMenuItemIngredients, updateMenuItem } from '@/api/endpoints/menu-item.api'
import { getIngredients } from '@/api/endpoints/ingredient.api'

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export default {
  name: 'RecipeImportDrawer',
  components: { X, Upload },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'imported'],
  data() {
    return {
      loading: false,
      menuItems: [],
      ingredients: [],
      rows: [],
      fileName: '',
      parseError: '',
      applying: false,
      result: null,
    }
  },
  computed: {
    menuByName() {
      const m = new Map()
      for (const mi of this.menuItems) if (mi?.id && mi?.name) m.set(norm(mi.name), mi.id)
      return m
    },
    ingByMarketPrice() {
      const m = new Map()
      for (const i of this.ingredients) if (i?.marketPriceId && i?.id) m.set(String(i.marketPriceId), i.id)
      return m
    },
    ingByName() {
      const m = new Map()
      for (const i of this.ingredients) if (i?.id && i?.name) m.set(norm(i.name), i.id)
      return m
    },
    analysis() {
      const byMenu = new Map() // menuItemId -> [{ingredientId, numberOfUnits}]
      const readyByMenu = new Map() // menuItemId -> 'Yes' | 'No'
      const skipped = []
      let applicable = 0
      for (const r of this.rows) {
        const plat = r.plat ?? r.Plat ?? ''
        const ing = r.ingredient ?? r.Ingredient ?? ''
        const mpId = String(r.market_price_id ?? r.marketPriceId ?? '').trim()
        const qty = Number(String(r.quantite ?? r.Quantite ?? '').replace(',', '.'))
        const rfs = String(r.ready_for_sale ?? r.readyForSale ?? '').trim().toLowerCase()
        const menuItemId = this.menuByName.get(norm(plat))
        if (!menuItemId) { skipped.push({ plat, ingredient: ing, reason: 'plat introuvable' }); continue }
        // readyForSale : capté pour TOUT plat résolu (même si ses ingrédients ne le sont pas)
        if (rfs === 'yes' || rfs === 'no') readyByMenu.set(menuItemId, rfs === 'yes' ? 'Yes' : 'No')
        const ingredientId = (mpId && this.ingByMarketPrice.get(mpId)) || this.ingByName.get(norm(ing))
        if (!ingredientId) { skipped.push({ plat, ingredient: ing, reason: 'ingrédient introuvable (créer dans MarketPrice/Ingredient)' }); continue }
        if (!Number.isFinite(qty) || qty <= 0) { skipped.push({ plat, ingredient: ing, reason: 'quantité manquante' }); continue }
        if (!byMenu.has(menuItemId)) byMenu.set(menuItemId, [])
        byMenu.get(menuItemId).push({ ingredientId, numberOfUnits: qty })
        applicable += 1
      }
      return { groups: [...byMenu.entries()], readyByMenu: [...readyByMenu.entries()], skipped, applicable }
    },
  },
  watch: {
    modelValue(open) { if (open) this.load() },
  },
  methods: {
    close() { this.$emit('update:modelValue', false) },
    async load() {
      this.result = null; this.rows = []; this.fileName = ''; this.parseError = ''
      this.loading = true
      try {
        const [mi, ing] = await Promise.all([getAllMenuItems(), getIngredients()])
        this.menuItems = Array.isArray(mi) ? mi : (mi?.data || [])
        this.ingredients = Array.isArray(ing) ? ing : (ing?.data || [])
      } catch (e) {
        this.parseError = 'Chargement catalogue échoué : ' + (e?.message || e)
      } finally {
        this.loading = false
      }
    },
    onFileChange(e) {
      const file = e.target.files?.[0]
      if (!file) return
      this.fileName = file.name; this.parseError = ''; this.result = null
      const reader = new FileReader()
      reader.onload = () => {
        try {
          this.rows = this.parseCsv(String(reader.result || ''))
          if (!this.rows.length) this.parseError = 'CSV vide ou colonnes inattendues (attendu: plat, ingredient, market_price_id, quantite).'
        } catch (err) {
          this.parseError = 'Parse CSV : ' + (err?.message || err)
        }
      }
      reader.onerror = () => { this.parseError = 'Lecture du fichier échouée.' }
      reader.readAsText(file, 'utf-8')
    },
    // Parseur CSV minimal (gère guillemets + "" échappés + BOM). Zéro dépendance.
    parseCsv(text) {
      text = text.replace(/^﻿/, '')
      const lines = text.split(/\r\n|\n|\r/).filter((l) => l.length)
      if (!lines.length) return []
      const split = (line) => {
        const out = []; let cur = ''; let q = false
        for (let i = 0; i < line.length; i++) {
          const c = line[i]
          if (q) {
            if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
            else if (c === '"') q = false
            else cur += c
          } else if (c === '"') q = true
          else if (c === ',') { out.push(cur); cur = '' }
          else cur += c
        }
        out.push(cur)
        return out
      }
      const headers = split(lines[0]).map((h) => h.trim())
      const rows = []
      for (let i = 1; i < lines.length; i++) {
        const cells = split(lines[i])
        const obj = {}
        headers.forEach((h, idx) => { obj[h] = (cells[idx] ?? '').trim() })
        rows.push(obj)
      }
      return rows.filter((r) => r.plat || r.Plat)
    },
    async apply() {
      this.applying = true
      let ok = 0, fail = 0, rfsOk = 0
      const a = this.analysis
      // 1. readyForSale sur TOUS les plats résolus (No = composé → réarmement
      //    sur ingrédients ; Yes = vendu tel quel → réarmement sur le plat).
      for (const [menuItemId, readyForSale] of a.readyByMenu) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await updateMenuItem(menuItemId, { readyForSale })
          rfsOk += 1
        } catch (e) { /* noop */ }
      }
      // 2. Ingrédients (PUT remplace la recette du plat).
      for (const [menuItemId, ingredients] of a.groups) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await replaceMenuItemIngredients(menuItemId, ingredients)
          ok += 1
        } catch (e) {
          fail += 1
        }
      }
      this.result = { ok, fail, rfsOk }
      this.applying = false
      this.$emit('imported', { ok, fail, rfsOk })
    },
  },
}
</script>

<style scoped>
.rid-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 4000; display: flex; justify-content: flex-end; }
.rid-drawer { width: 520px; max-width: 96vw; height: 100%; background: #fff; display: flex; flex-direction: column; box-shadow: -8px 0 30px rgba(0,0,0,.18); }
.rid--dark { background: #1e1e24; color: #eee; }
.rid-header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #eee; }
.rid--dark .rid-header { border-color: #333; }
.rid-body { flex: 1; overflow-y: auto; }
.rid-footer { display: flex; align-items: center; border-top: 1px solid #eee; }
.rid--dark .rid-footer { border-color: #333; }
.rid-dropzone { border: 2px dashed #d0d0d0; border-radius: 12px; cursor: pointer; transition: border-color .15s; }
.rid-dropzone:hover { border-color: #ff3131; }
.rid-chip { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; }
.rid-chip-green { background: #DCFCE7; color: #15803d; }
.rid-chip-blue { background: #DBEAFE; color: #1d4ed8; }
.rid-chip-amber { background: #FEF3C7; color: #b45309; }
.rid-skip { background: #FAFAFA; border-radius: 8px; padding: 10px 12px; max-height: 180px; overflow-y: auto; }
.rid--dark .rid-skip { background: #26262e; }
.rid-result { background: #F0FDF4; border-radius: 8px; padding: 10px 12px; }
.rid-transition-enter-active, .rid-leave-active { transition: opacity .2s; }
.rid-enter-from, .rid-leave-to { opacity: 0; }
</style>
