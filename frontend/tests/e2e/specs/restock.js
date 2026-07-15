describe('Space Restock', () => {
  it('renders the restock workflow in demo mode', () => {
    cy.visit('/spaces/adidas-arena/restock?demo=1')

    cy.contains('h1', 'Réarmement', { timeout: 30000 }).should('be.visible')
    cy.contains('Éléments à stocker').should('be.visible')
    cy.get('.sr-setting-row', { timeout: 30000 }).should('have.length.greaterThan', 0)

    cy.contains('button', 'Générer le réarmement').click()
    cy.contains('Tableau de réarmement').should('be.visible')
    cy.get('.sr-table-group', { timeout: 30000 }).should('exist')

    cy.contains('button', 'Feuille de course').click()
    cy.contains('Feuille de course').should('be.visible')
    cy.get('.sr-supplier-group', { timeout: 30000 }).should('exist')
  })
})
