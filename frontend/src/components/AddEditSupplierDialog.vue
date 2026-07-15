<script>
import Dialog from "../ui/dialog.vue";
import DialogContent from "../ui/dialogContent.vue";
import DialogDescription from "../ui/dialogDescription.vue";
import DialogFooter from "../ui/dialogFooter.vue";
import DialogHeader from "../ui/dialogHeader.vue";
import DialogTitle from "../ui/dialogTitle.vue";
import Button from "../ui/button.vue";
import Input from "../ui/input.vue";
import Label from "../ui/label.vue";
import { Upload, Users } from "lucide-vue-next";
export default {
  name: "AddEditSupplierDialog",

  props: {
    supplier: {
      type: Object, // SupplierItem | null
      required: false,
      default: null,
    },
    spaces: {
      type: Array,
      required: true,
    },
    onSave: {
      type: Function,
      required: true,
    },
    onCancel: {
      type: Function,
      required: true,
    },
  },

  data() {
    return {
      formData: {
        id: this.supplier?.id || "",
        name: this.supplier?.name || "",
        email: this.supplier?.email || "",
        tel: this.supplier?.tel || "",
        address: this.supplier?.address || "",
        city: this.supplier?.city || "",
        postcode: this.supplier?.postcode || "",
        sites: this.supplier?.sites || (this.spaces || []).map((s) => s.id),
        picture: this.supplier?.picture || "",
      },
    };
  },

  computed: {
    allSiteIds() {
      return (this.spaces || []).map((s) => s.id);
    },

    isAllSitesChecked() {
      return (
        this.formData.sites.length === this.allSiteIds.length &&
        this.allSiteIds.every((id) => this.formData.sites.includes(id))
      );
    },
  },

  watch: {
    // Debug: Log spaces when dialog opens / change
    spaces: {
      handler(newVal) {
        console.log("AddEditSupplierDialog - Available spaces:", newVal);
      },
      immediate: true,
    },
  },

  methods: {
    handleSubmit(e) {
      e.preventDefault();

      console.log("Saving supplier with space IDs:", this.formData.sites);
      console.log(
        "Space IDs linked to supplier ID:",
        this.formData.id,
        "→",
        this.formData.sites,
      );

      this.onSave(this.formData);
    },

    toggleSite(siteId) {
      const sites = this.formData.sites || [];
      const nextSites = sites.includes(siteId)
        ? sites.filter((id) => id !== siteId)
        : [...sites, siteId];

      this.formData = {
        ...this.formData,
        sites: nextSites,
      };
    },

    toggleAllSites() {
      this.formData = {
        ...this.formData,
        sites: this.isAllSitesChecked ? [] : this.allSiteIds,
      };
    },

    handlePictureUpload(e) {
      const file = e?.target?.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          this.formData = {
            ...this.formData,
            picture: reader.result,
          };
        };
        reader.readAsDataURL(file);
      }
    },
  },
};
</script>
<template>
  <Dialog :open="true" :onOpenChange="onCancel">
    <DialogContent
      class="max-w-2xl max-h-[90vh] overflow-y-auto"
      aria-describedby="supplier-form-description"
    >
      <DialogHeader>
        <DialogTitle>
          {{ supplier ? "Edit Supplier" : "Add New Supplier" }}
        </DialogTitle>
        <DialogDescription id="supplier-form-description">
          Enter the supplier details below
        </DialogDescription>
      </DialogHeader>

      <form @submit="handleSubmit">
        <div class="space-y-4 py-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <Label>Picture</Label>

              <div class="flex items-center gap-4 mt-2">
                <ImageWithFallback
                  v-if="formData.picture"
                  :src="formData.picture"
                  alt="Supplier"
                  class="w-24 h-24 rounded object-cover"
                />
                <div
                  v-else
                  class="w-24 h-24 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
                >
                  <Users class="w-12 h-12 text-gray-400 dark:text-gray-500" />
                </div>

                <div class="flex-1">
                  <input
                    id="picture-upload"
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handlePictureUpload"
                  />

                  <label for="picture-upload">
                    <Button type="button" variant="outline" asChild>
                      <span class="cursor-pointer">
                        <Upload class="w-4 h-4 mr-2" />
                        Upload Picture
                      </span>
                    </Button>
                  </label>

                  <Button
                    v-if="formData.picture"
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="ml-2"
                    @click="formData = { ...formData, picture: '' }"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>

            <div class="col-span-2">
              <Label for="name">Name *</Label>
              <Input
                id="name"
                required
                :value="formData.name"
                @input="formData = { ...formData, name: $event?.target?.value }"
              />
            </div>

            <div>
              <Label for="email">Email</Label>
              <Input
                id="email"
                type="email"
                :value="formData.email"
                @input="formData = { ...formData, email: $event?.target?.value }"
              />
            </div>

            <div>
              <Label for="tel">Tel</Label>
              <Input
                id="tel"
                :value="formData.tel"
                @input="formData = { ...formData, tel: $event?.target?.value }"
              />
            </div>

            <div class="col-span-2">
              <Label for="address">Address</Label>
              <Input
                id="address"
                :value="formData.address"
                @input="formData = { ...formData, address: $event?.target?.value }"
              />
            </div>

            <div>
              <Label for="city">City</Label>
              <Input
                id="city"
                :value="formData.city"
                @input="formData = { ...formData, city: $event?.target?.value }"
              />
            </div>

            <div>
              <Label for="postcode">Postcode</Label>
              <Input
                id="postcode"
                :value="formData.postcode"
                @input="formData = { ...formData, postcode: $event?.target?.value }"
              />
            </div>

            <div class="col-span-2">
              <Label>
                Sites * {{ spaces.length > 0 ? `(${spaces.length} available)` : "" }}
              </Label>

              <div class="border dark:border-gray-700 rounded-md p-3 space-y-2 mt-2">
                <div class="flex items-center gap-2">
                  <input
                    id="all-sites"
                    type="checkbox"
                    class="w-4 h-4 cursor-pointer"
                    :checked="isAllSitesChecked"
                    @change="toggleAllSites"
                  />
                  <Label for="all-sites" class="cursor-pointer">
                    All Sites
                  </Label>
                </div>

                <div
                  v-if="spaces.length === 0"
                  class="border-t dark:border-gray-700 pt-2 text-sm text-gray-500 dark:text-gray-400"
                >
                  No spaces available. Please create a space first in the 3D Space Builder.
                </div>

                <div
                  v-else
                  class="border-t dark:border-gray-700 pt-2 space-y-2"
                >
                  <p
                    v-if="isAllSitesChecked"
                    class="text-xs text-gray-500 dark:text-gray-400 mb-2"
                  >
                    All {{ spaces.length }} sites selected
                  </p>

                  <div v-for="space in spaces" :key="space.id" class="flex items-center gap-2">
                    <input
                      :id="`site-${space.id}`"
                      type="checkbox"
                      class="w-4 h-4 cursor-pointer"
                      :checked="formData.sites.includes(space.id)"
                      @change="toggleSite(space.id)"
                    />
                    <Label
                      :for="`site-${space.id}`"
                      class="cursor-pointer"
                    >
                      {{ space.name }}
                    </Label>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" :onClick="onCancel">
            Cancel
          </Button>
          <Button type="submit">
            {{ supplier ? "Update" : "Add" }} Supplier
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>