import { reactive } from 'vue';

const state = reactive({
  show: false,
  title: '',
  message: '',
  confirmText: '',
  cancelText: '',
  confirmColor: 'primary',
  icon: 'mdi-help-circle-outline',
  iconColor: 'primary',
  // optional third "save" button — only shown when set
  saveButtonText: '',
  saveButtonColor: '#2563eb',
  resolveFn: null,
});

export function useConfirmDialogState() {
  return state;
}

export function confirmDialog({
  title,
  message,
  confirmText,
  cancelText,
  confirmColor = 'primary',
  icon = 'mdi-help-circle-outline',
  iconColor = 'primary',
}) {
  return new Promise((resolve) => {
    state.title = title;
    state.message = message;
    state.confirmText = confirmText;
    state.cancelText = cancelText;
    state.confirmColor = confirmColor;
    state.icon = icon;
    state.iconColor = iconColor;
    state.saveButtonText = '';
    state.resolveFn = resolve;
    state.show = true;
  });
}

// Resolves to 'leave' | 'save' | false
export function leaveDialog({
  title,
  message,
  leaveText = 'Continuer sans sauvegarder',
  saveText = 'Continuer et sauvegarder',
  cancelText = 'Annuler',
  icon = 'mdi-content-save-alert-outline',
  iconColor = '#ff3131',
}) {
  return new Promise((resolve) => {
    state.title = title;
    state.message = message;
    state.confirmText = leaveText;
    state.cancelText = cancelText;
    state.confirmColor = '#ff3131';
    state.icon = icon;
    state.iconColor = iconColor;
    state.saveButtonText = saveText;
    state.saveButtonColor = '#2563eb';
    state.resolveFn = resolve;
    state.show = true;
  });
}
