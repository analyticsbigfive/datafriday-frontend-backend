jest.mock('@/api/endpoints/menu.api', () => ({ getMenuComponents: jest.fn() }))

import menuComponents from '@/store/modules/menuComponents'

describe('menuComponents store : UPSERT_ROW garde la liste triée par nom', () => {
  const { UPSERT_ROW } = menuComponents.mutations
  const names = (state) => state.rows.map((r) => r.name)

  it('une copie dupliquée prend sa place alphabétique, pas la fin de liste', () => {
    const state = { rows: [{ id: '1', name: 'Bun' }, { id: '2', name: 'Sauce' }, { id: '3', name: 'Steak' }] }
    UPSERT_ROW(state, { id: '4', name: 'Bun (copie)' })
    expect(names(state)).toEqual(['Bun', 'Bun (copie)', 'Sauce', 'Steak'])
  })

  it('casse, accents et nombres ignorés comme un tri humain', () => {
    const state = { rows: [{ id: '1', name: 'Frites 10' }, { id: '2', name: 'oignon' }] }
    UPSERT_ROW(state, { id: '3', name: 'Frites 9' })
    UPSERT_ROW(state, { id: '4', name: 'Éclair' })
    expect(names(state)).toEqual(['Éclair', 'Frites 9', 'Frites 10', 'oignon'])
  })

  it('une mise à jour remplace la ligne existante sans la dupliquer', () => {
    const state = { rows: [{ id: '1', name: 'Bun' }, { id: '2', name: 'Sauce' }] }
    UPSERT_ROW(state, { id: '1', name: 'Tomate' })
    expect(names(state)).toEqual(['Sauce', 'Tomate'])
  })
})
