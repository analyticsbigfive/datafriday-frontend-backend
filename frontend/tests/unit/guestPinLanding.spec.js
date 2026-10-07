import { slugFromGuestPinUrl, guestPinLandingRoute, rememberGuestSlug, lastGuestSlug } from '@/utils/guestPinLanding'

describe('guestPinLanding (page d\'attente du responsable PDV)', () => {
  beforeEach(() => localStorage.clear())

  it('lit le slug d\'un lien de connexion invité scanné, quel que soit le domaine', () => {
    expect(slugFromGuestPinUrl('https://datafriday.app/login/pin/oceane-10-ab12')).toBe('oceane-10-ab12')
    expect(slugFromGuestPinUrl('https://preview.example.com/login/pin/erdre-4/')).toBe('erdre-4')
  })

  it('refuse un QR code qui n\'est pas un accès inventaire', () => {
    expect(slugFromGuestPinUrl('https://www.fcnantes.com/billetterie')).toBeNull()
    expect(slugFromGuestPinUrl('WIFI:S:stade;T:WPA;P:secret;;')).toBeNull()
    expect(slugFromGuestPinUrl('')).toBeNull()
  })

  it('renvoie vers la page du dernier PDV scanné, jamais vers la connexion staff', () => {
    expect(guestPinLandingRoute()).toEqual({ name: 'login-pin' })
    rememberGuestSlug('oceane-10-ab12')
    expect(lastGuestSlug()).toBe('oceane-10-ab12')
    expect(guestPinLandingRoute()).toEqual({ name: 'login-pin', params: { slug: 'oceane-10-ab12' } })
  })
})
