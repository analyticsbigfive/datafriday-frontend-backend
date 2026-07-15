<template>
  <Dialog
    :open="open"
    :onOpenChange="(val) => { if (!val) onClose() }"
  >
    <DialogContent
      class="max-w-2xl max-h-[90vh] overflow-y-auto"
      aria-describedby="space-form-description"
    >
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription id="space-form-description">
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="space-y-6">
        <!-- Basic Information -->
        <div class="space-y-4">
          <h3 class="font-medium">Basic Information</h3>
          <div class="space-y-2">
            <Label for="name">Space Name *</Label>
            <input type="text" v-model="formData.name">
            <Input
              id="name"
              value="Test"
              placeholder="e.g., Emirates Stadium"
              required
            />
            {{ formData.name }}
          </div>
        </div>

        <!-- Space Details -->
        <div class="space-y-4">
          <h3 class="font-medium">Space Details</h3>
          <div class="space-y-2">
            <Label for="spaceType">Space Type</Label>
            <Select v-model="formData.spaceType">
              <SelectTrigger id="spaceType">
                <SelectValue placeholder="Select space type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Stadium">Stadium</SelectItem>
                <SelectItem value="Arena">Arena</SelectItem>
                <SelectItem value="Zenith">Zénith</SelectItem>
                <SelectItem value="Indoor Festival">Indoor Festival</SelectItem>
                <SelectItem value="Outdoor Festival">Outdoor Festival</SelectItem>
                <SelectItem value="Indoor Show Venue">Indoor Show Venue</SelectItem>
                <SelectItem value="Outdoor Show Venue">Outdoor Show Venue</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div
            v-if="formData.spaceType === 'Other'"
            class="space-y-2"
          >
            <Label for="spaceTypeOther">Describe Space Type</Label>
            <Input
              id="spaceTypeOther"
              v-model="formData.spaceTypeOther"
              placeholder="Describe the space type..."
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="maxCapacity">Max Capacity</Label>
              <Input
                id="maxCapacity"
                type="number"
                min="0"
                :value="formData.maxCapacity ?? ''"
                @input="onMaxCapacityInput($event.target.value)"
                placeholder="e.g., 60000"
              />
            </div>
            <div class="space-y-2">
              <Label for="department">Department</Label>
              <Input
                id="department"
                type="number"
                min="1"
                max="95"
                :value="formData.department ?? ''"
                @input="onDepartmentInput($event.target.value)"
                placeholder="e.g., 75"
              />
              <p class="text-xs text-gray-500">
                French department number (01-95)
              </p>
            </div>
          </div>
        </div>

        <!-- Address -->
        <div class="space-y-4">
          <h3 class="font-medium">Address</h3>
          <div class="space-y-2">
            <Label for="addressLine1">
              Address Line 1
              <span
                v-if="loadingGoogleMaps"
                class="ml-2 text-xs text-gray-500"
              >
                (Loading autocomplete...)
              </span>
            </Label>
            <Input
              id="addressLine1"
              ref="addressInputRef"
              v-model="formData.addressLine1"
              placeholder="Start typing to search..."
            />
          </div>
          <div class="space-y-2">
            <Label for="addressLine2">Address Line 2</Label>
            <Input
              id="addressLine2"
              v-model="formData.addressLine2"
              placeholder="Apt, suite, unit, etc."
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="city">City</Label>
              <Input
                id="city"
                v-model="formData.city"
                placeholder="City"
              />
            </div>
            <div class="space-y-2">
              <Label for="postcode">Postcode</Label>
              <Input
                id="postcode"
                v-model="formData.postcode"
                placeholder="Postcode"
              />
            </div>
          </div>
          <div class="space-y-2">
            <Label for="country">Country</Label>
            <Input
              id="country"
              v-model="formData.country"
              placeholder="Country"
            />
          </div>
        </div>

        <!-- Contact Information -->
        <div class="space-y-4">
          <h3 class="font-medium">Contact Information</h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="tel">Phone Number</Label>
              <Input
                id="tel"
                type="tel"
                v-model="formData.tel"
                placeholder="+44 20 7619 5003"
              />
            </div>
            <div class="space-y-2">
              <Label for="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                v-model="formData.email"
                placeholder="info@example.com"
              />
            </div>
          </div>
        </div>

        <!-- Main Contact Person -->
        <div class="space-y-4">
          <h3 class="font-medium">Main Contact Person</h3>
          <div class="space-y-2">
            <Label for="mainContactPerson">Name</Label>
            <Input
              id="mainContactPerson"
              v-model="formData.mainContactPerson"
              placeholder="John Smith"
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="contactEmail">Email</Label>
              <Input
                id="contactEmail"
                type="email"
                v-model="formData.contactEmail"
                placeholder="john.smith@example.com"
              />
            </div>
            <div class="space-y-2">
              <Label for="contactTel">Phone</Label>
              <Input
                id="contactTel"
                type="tel"
                v-model="formData.contactTel"
                placeholder="+44 20 1234 5678"
              />
            </div>
          </div>
        </div>

        <!-- Social Media -->
        <div class="space-y-4">
          <h3 class="font-medium">Social Media</h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="instagram">Instagram</Label>
              <Input
                id="instagram"
                v-model="formData.instagram"
                placeholder="@username"
              />
            </div>
            <div class="space-y-2">
              <Label for="tiktok">TikTok</Label>
              <Input
                id="tiktok"
                v-model="formData.tiktok"
                placeholder="@username"
              />
            </div>
            <div class="space-y-2">
              <Label for="facebook">Facebook</Label>
              <Input
                id="facebook"
                v-model="formData.facebook"
                placeholder="@username"
              />
            </div>
            <div class="space-y-2">
              <Label for="twitter">Twitter</Label>
              <Input
                id="twitter"
                v-model="formData.twitter"
                placeholder="@username"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            @click="onClose"
            :disabled="isSubmitting"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            :disabled="isSubmitting"
          >
            <Loader2
              v-if="isSubmitting"
              class="w-4 h-4 mr-2 animate-spin"
            />
            Create Space
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script>
import Dialog from '../ui/dialog.vue';
import DialogContent from '../ui/dialogContent.vue';
import DialogHeader from '../ui/dialogHeader.vue';
import DialogTitle from '../ui/dialogTitle.vue';
import DialogDescription from '../ui/dialogDescription.vue';
import DialogFooter from '../ui/dialogFooter.vue';
import Button from '../ui/button.vue';
import Input from '../ui/input.vue';
import Label from '../ui/label.vue';

import Select from '../ui/select.vue';
import SelectContent from '../ui/selectContent.vue';
import SelectItem from '../ui/selectItem.vue';
import SelectTrigger from '../ui/selectTrigger.vue';
import SelectValue from '../ui/selectValue.vue';

//import { toast } from 'sonner';
import { Loader2 } from 'lucide-vue-next';

// Utilitaire pour charger Google Places
function loadGooglePlacesScript() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps && window.google.maps.places) {
      resolve();
      return;
    }

    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com"]'
    );
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      return;
    }

    const apiKey =
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${
      apiKey || ''
    }&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });
}

export default {
  name: 'SpaceFormDialog',
  components: {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Button,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Loader2,
  },
  props: {
    open: {
      type: Boolean,
      required: true,
    },
    onClose: {
      type: Function,
      required: true,
    },
    onSave: {
      type: Function,
      required: true,
    },
    isSubmitting: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      default: 'Create New Space',
    },
    description: {
      type: String,
      default: 'Fill in the details for your new space',
    },
  },
  data() {
    return {
      formData: {
        name: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        postcode: '',
        country: '',
        tel: '',
        email: '',
        mainContactPerson: '',
        contactEmail: '',
        contactTel: '',
        instagram: '',
        tiktok: '',
        facebook: '',
        twitter: '',
        spaceType: undefined,
        spaceTypeOther: undefined,
        maxCapacity: undefined,
        department: undefined,
        floors: undefined,
        basements: undefined,
        hasForecourt: undefined,
        hasExternalArea: undefined,
      },
      googleMapsLoaded: false,
      loadingGoogleMaps: false,
      autocomplete: null,
    };
  },
  watch: {
    open: {
      immediate: true,
      handler(newVal) {
        if (newVal && !this.googleMapsLoaded && !this.loadingGoogleMaps) {
          this.loadingGoogleMaps = true;
          loadGooglePlacesScript()
            .then(() => {
              this.googleMapsLoaded = true;
              this.loadingGoogleMaps = false;
            })
            .catch((error) => {
              console.error('Failed to load Google Maps:', error);
              this.loadingGoogleMaps = false;
            });
        }

        if (!newVal) {
          this.resetForm();
        }
      },
    },
    googleMapsLoaded(newVal) {
      if (
        newVal &&
        this.$refs.addressInputRef &&
        !this.autocomplete &&
        window.google &&
        window.google.maps &&
        window.google.maps.places
      ) {
        try {
          this.autocomplete = new window.google.maps.places.Autocomplete(
            this.$refs.addressInputRef,
            {
              types: ['address'],
              fields: ['address_components', 'formatted_address', 'name'],
            }
          );

          this.autocomplete.addListener('place_changed', () => {
            const place = this.autocomplete && this.autocomplete.getPlace();
            if (!place || !place.address_components) return;

            let addressLine1 = '';
            let addressLine2 = '';
            let city = '';
            let postcode = '';
            let country = '';

            place.address_components.forEach((component) => {
              const types = component.types;

              if (types.includes('street_number')) {
                addressLine1 = component.long_name + ' ';
              }
              if (types.includes('route')) {
                addressLine1 += component.long_name;
              }
              if (types.includes('subpremise') || types.includes('premise')) {
                addressLine2 = component.long_name;
              }
              if (types.includes('locality') || types.includes('postal_town')) {
                city = component.long_name;
              }
              if (types.includes('postal_code')) {
                postcode = component.long_name;
              }
              if (types.includes('country')) {
                country = component.long_name;
              }
            });

            this.formData.addressLine1 = addressLine1.trim();
            this.formData.addressLine2 = addressLine2;
            this.formData.city = city;
            this.formData.postcode = postcode;
            this.formData.country = country;
          });
        } catch (error) {
          console.error('Failed to initialize Google Places Autocomplete:', error);
        }
      }
    },
  },
  methods: {
    resetForm() {
      this.formData = {
        name: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        postcode: '',
        country: '',
        tel: '',
        email: '',
        mainContactPerson: '',
        contactEmail: '',
        contactTel: '',
        instagram: '',
        tiktok: '',
        facebook: '',
        twitter: '',
        spaceType: undefined,
        spaceTypeOther: undefined,
        maxCapacity: undefined,
        department: undefined,
        floors: undefined,
        basements: undefined,
        hasForecourt: undefined,
        hasExternalArea: undefined,
      };
    },
    async handleSubmit() {
      console.log('formData:', this.formData);
      console.log('formData.name:', this.formData.name);
      console.log('name type:', typeof this.formData.name);
      console.log('name trimmed:', this.formData.name?.trim());
      if (!this.formData.name || !this.formData.name.trim()) {
        //toast.error('Please enter a space name');
        console.log('Please enter a space name');
        return;
      }

      try {
        await this.onSave({ ...this.formData });
        console.log('Space saved successfully');
      } catch (e) {
        console.log('Error saving space:', e);
      }
    },

    onMaxCapacityInput(value) {
      if (value === '') {
        this.formData.maxCapacity = undefined;
      } else {
        this.formData.maxCapacity = parseInt(value, 10);
      }
    },
    onDepartmentInput(value) {
      if (value === '') {
        this.formData.department = undefined;
      } else {
        this.formData.department = parseInt(value, 10);
      }
    },
  },
};
</script>