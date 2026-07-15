<template>
  <v-row class="mb-6">
    <v-col cols="12" sm="6" md="3">
      <v-card rounded="lg" elevation="0" border hover class="pa-4">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="text-caption text-medium-emphasis font-weight-medium">Total Produits</div>
          <v-avatar color="blue-lighten-5" size="40">
            <v-icon color="blue" size="20">mdi-package-variant</v-icon>
          </v-avatar>
        </div>
        <div class="text-h5 font-weight-bold">{{ totalProducts }}</div>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="3">
      <v-card rounded="lg" elevation="0" border hover class="pa-4">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="text-caption text-medium-emphasis font-weight-medium">Fournisseurs</div>
          <v-avatar color="green-lighten-5" size="40">
            <v-icon color="green" size="20">mdi-truck-delivery</v-icon>
          </v-avatar>
        </div>
        <div class="text-h5 font-weight-bold">{{ totalSuppliers }}</div>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="3">
      <v-card rounded="lg" elevation="0" border hover class="pa-4">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="text-caption text-medium-emphasis font-weight-medium">Nourriture</div>
          <v-avatar color="orange-lighten-5" size="40">
            <v-icon color="orange" size="20">mdi-food</v-icon>
          </v-avatar>
        </div>
        <div class="text-h5 font-weight-bold">{{ foodCount }}</div>
      </v-card>
    </v-col>
    <v-col cols="12" sm="6" md="3">
      <v-card rounded="lg" elevation="0" border hover class="pa-4">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="text-caption text-medium-emphasis font-weight-medium">Boissons</div>
          <v-avatar color="purple-lighten-5" size="40">
            <v-icon color="purple" size="20">mdi-cup</v-icon>
          </v-avatar>
        </div>
        <div class="text-h5 font-weight-bold">{{ beverageCount }}</div>
      </v-card>
    </v-col>
  </v-row>
</template>

<script>
export default {
  name: 'MarketPriceStats',
  props: {
    totalProducts: {
      type: Number,
      default: 0,
    },
    totalSuppliers: {
      type: Number,
      default: 0,
    },
    foodCount: {
      type: Number,
      default: 0,
    },
    beverageCount: {
      type: Number,
      default: 0,
    },
  },
};
</script>
