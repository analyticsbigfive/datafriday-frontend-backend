<template>
  <Dialog :open="open" @update:open="onClose">
    <DialogContent
      class="max-w-3xl w-full"
      aria-describedby="space-image-upload-description"
    >
      <DialogHeader>
        <DialogTitle>Upload Space Image</DialogTitle>
        <DialogDescription id="space-image-upload-description">
          Upload and customize an image for your space
        </DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <div>
          <Label>Select Image</Label>
          <div class="mt-2">
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              @change="handleFileSelect"
              class="hidden"
            />
            <Button
                variant="outline"
                class="w-full"
                @click="() => $refs.fileInputRef && $refs.fileInputRef.click()"
                >
                <Upload class="w-4 h-4 mr-2" />
                {{ selectedImage ? 'Change Image' : 'Upload Image' }}
            </Button>
          </div>
        </div>
        <template v-if="selectedImage">
          <div>
            <Label>Adjust Image</Label>
            <div
              class="mt-2 relative bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center"
              :style="{ height: '280px' }"
            >
              <div
                class="relative cursor-move"
                :style="{ width: '400px', height: '240px' }"
                @mousedown="handleMouseDown"
                @mousemove="handleMouseMove"
                @mouseup="handleMouseUp"
                @mouseleave="handleMouseUp"
              >
                <div class="absolute inset-0 overflow-hidden border-2 border-gray-300 rounded-lg shadow-lg bg-white">
                  <div
                    class="absolute inset-0 flex items-center justify-center"
                    :style="{ transform: `translate(${position.x}px, ${position.y}px)` }"
                  >
                    <img
                      :src="selectedImage"
                      alt="Preview"
                      class="max-w-none"
                      :style="{
                        transform: `scale(${zoom}) rotate(${rotation}deg)`,
                        transformOrigin: 'center',
                        width: '400px',
                        height: '240px',
                        objectFit: 'cover',
                      }"
                      :draggable="false"
                    />
                  </div>
                </div>
              </div>
            </div>
            <p class="text-xs text-gray-500 mt-1">
              Drag to reposition, use controls to zoom and rotate
            </p>
          </div>
          <div class="space-y-4">
            <div>
              <div class="flex items-center justify-between mb-2">
                <Label class="text-sm">Zoom</Label>
                <span class="text-sm text-gray-500">{{ zoom.toFixed(1) }}x</span>
              </div>
              <div class="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  @click="() => setZoom(Math.max(0.5, zoom - 0.1))"
                >
                  <ZoomOut class="w-4 h-4" />
                </Button>
                <Slider
                  :value="[zoom]"
                  @update:value="([value]) => setZoom(value)"
                  :min="0.5"
                  :max="3"
                  :step="0.1"
                  class="flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  @click="() => setZoom(Math.min(3, zoom + 0.1))"
                >
                  <ZoomIn class="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <div class="flex items-center justify-between mb-2">
                <Label class="text-sm">Rotation</Label>
                <Button size="sm" variant="outline" @click="handleRotate">
                  <RotateCw class="w-4 h-4 mr-2" />
                  Rotate 90°
                </Button>
              </div>
            </div>
          </div>
        </template>
      </div>
      <canvas ref="canvasRef" class="hidden" />
      <DialogFooter class="sm:justify-between">
        <Button
          v-if="currentImage && onRemove"
          variant="destructive"
          @click="() => { onRemove(); onClose(); }"
        >
          Remove Image
        </Button>
        <div class="flex gap-2">
          <Button variant="outline" @click="onClose">
            Cancel
          </Button>
          <Button @click="handleSave" :disabled="!selectedImage">
            Save Image
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script>
import { toast } from 'vue-sonner'
import Dialog from '../ui/dialog.vue';
import DialogContent from '../ui/dialogContent.vue';
import DialogHeader from '../ui/dialogHeader.vue';
import DialogTitle from '../ui/dialogTitle.vue';
import DialogDescription from '../ui/dialogDescription.vue';
import DialogFooter from '../ui/dialogFooter.vue';
import Button from '../ui/button.vue';
import Label from '../ui/label.vue';
import Slider from '../ui/slider.vue';
import { Upload, ZoomIn, ZoomOut, RotateCw } from 'lucide-vue-next'

export default {
  name: 'SpaceImageUpload',
  components: {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Button,
    Label,
    Slider,
    Upload,
    ZoomIn,
    ZoomOut,
    RotateCw,
  },

  props: {
    open: { type: Boolean, required: true },
    onClose: { type: Function, required: true },
    onSave: { type: Function, required: true },
    onRemove: { type: Function, default: undefined },
    currentImage: { type: String, default: undefined },
  },

  data() {
    return {
      selectedImage: null,
      zoom: 1,
      rotation: 0,
      position: { x: 0, y: 0 },
      isDragging: false,
      dragStart: { x: 0, y: 0 },

      fileInputRef: null,
      canvasRef: null,
    }
  },

  mounted() {
    this.fileInputRef = this.$refs.fileInputRef || null
    this.canvasRef = this.$refs.canvasRef || null
  },

  watch: {
    open: {
      immediate: true,
      handler() {
        if (this.open && this.currentImage) {
          this.setSelectedImage(this.currentImage)
          this.setZoom(1)
          this.setRotation(0)
          this.setPosition({ x: 0, y: 0 })
        } else if (!this.open) {
          this.setSelectedImage(null)
          this.setZoom(1)
          this.setRotation(0)
          this.setPosition({ x: 0, y: 0 })
        }
      },
    },
    currentImage() {
      if (this.open && this.currentImage) {
        this.setSelectedImage(this.currentImage)
        this.setZoom(1)
        this.setRotation(0)
        this.setPosition({ x: 0, y: 0 })
      }
    },
  },

  methods: {
    setSelectedImage(value) {
      this.selectedImage = value
    },
    setZoom(value) {
      this.zoom = value
    },
    setRotation(value) {
      this.rotation = value
    },
    setPosition(value) {
      this.position = value
    },
    setIsDragging(value) {
      this.isDragging = value
    },
    setDragStart(value) {
      this.dragStart = value
    },

    handleFileSelect(e) {
      const file = e && e.target && e.target.files ? e.target.files[0] : null
      if (!file) return

      if (!file.type || !file.type.startsWith('image/')) {
        toast.error('Please select an image file')
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB')
        return
      }

      const reader = new FileReader()
      reader.onload = (event) => {
        const result = event && event.target ? event.target.result : null
        this.setSelectedImage(result)
        this.setZoom(1)
        this.setRotation(0)
        this.setPosition({ x: 0, y: 0 })
      }
      reader.readAsDataURL(file)
    },

    handleMouseDown(e) {
      this.setIsDragging(true)
      this.setDragStart({
        x: e.clientX - this.position.x,
        y: e.clientY - this.position.y,
      })
    },

    handleMouseMove(e) {
      if (!this.isDragging) return
      this.setPosition({
        x: e.clientX - this.dragStart.x,
        y: e.clientY - this.dragStart.y,
      })
    },

    handleMouseUp() {
      this.setIsDragging(false)
    },

    handleRotate() {
      this.setRotation((this.rotation + 90) % 360)
    },

    handleSave() {
      if (!this.selectedImage || !this.canvasRef) return

      const canvas = this.canvasRef
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const img = new Image()
      img.onload = () => {
        const width = 800
        const height = 480
        canvas.width = width
        canvas.height = height

        ctx.clearRect(0, 0, width, height)
        ctx.save()

        ctx.translate(width / 2, height / 2)
        ctx.translate(this.position.x * 1.6, this.position.y * 1.6)
        ctx.rotate((this.rotation * Math.PI) / 180)
        ctx.scale(this.zoom, this.zoom)

        const imgWidth = img.width
        const imgHeight = img.height
        const aspectRatio = imgWidth / imgHeight
        const targetRatio = width / height

        let drawWidth, drawHeight
        if (aspectRatio > targetRatio) {
          drawHeight = height
          drawWidth = height * aspectRatio
        } else {
          drawWidth = width
          drawHeight = width / aspectRatio
        }

        ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
        ctx.restore()

        const finalImage = canvas.toDataURL('image/jpeg', 0.9)
        this.onSave(finalImage)
        this.onClose()
        toast.success('Space image saved successfully')
      }

      img.src = this.selectedImage
    },
  },
}
</script>