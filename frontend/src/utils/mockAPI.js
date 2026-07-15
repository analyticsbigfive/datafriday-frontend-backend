// Mock API pour la démo - simule une API backend
// Dans une vraie application, ceci serait remplacé par des appels HTTP

const STORAGE_KEY = 'space_creator_data'

export const mockAPI = {
  /**
   * Sauvegarder les données
   */
  async save(data) {
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
          console.log('✅ API: Données sauvegardées', data)
          resolve({ success: true, message: 'Données sauvegardées' })
        } catch (error) {
          console.error('❌ API: Erreur de sauvegarde', error)
          throw new Error('Erreur lors de la sauvegarde')
        }
      }, 500) // Simule un délai réseau
    })
  },

  /**
   * Charger les données
   */
  async load() {
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          const data = localStorage.getItem(STORAGE_KEY)
          if (data) {
            const parsed = JSON.parse(data)
            console.log('✅ API: Données chargées', parsed)
            resolve(parsed)
          } else {
            console.log('ℹ️ API: Aucune donnée trouvée')
            resolve(null)
          }
        } catch (error) {
          console.error('❌ API: Erreur de chargement', error)
          throw new Error('Erreur lors du chargement')
        }
      }, 500) // Simule un délai réseau
    })
  },

  /**
   * Supprimer les données
   */
  async delete() {
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          localStorage.removeItem(STORAGE_KEY)
          console.log('✅ API: Données supprimées')
          resolve({ success: true, message: 'Données supprimées' })
        } catch (error) {
          console.error('❌ API: Erreur de suppression', error)
          throw new Error('Erreur lors de la suppression')
        }
      }, 300)
    })
  },

  /**
   * Exemple d'export en JSON
   */
  exportJSON(data) {
    const dataStr = JSON.stringify(data, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `space-creator-${Date.now()}.json`
    link.click()
    
    URL.revokeObjectURL(url)
    console.log('✅ Export JSON réussi')
  },

  /**
   * Exemple d'import depuis JSON
   */
  importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result)
          console.log('✅ Import JSON réussi', data)
          resolve(data)
        } catch (error) {
          console.error('❌ Erreur de parsing JSON', error)
          reject(new Error('Fichier JSON invalide'))
        }
      }
      
      reader.onerror = () => {
        reject(new Error('Erreur de lecture du fichier'))
      }
      
      reader.readAsText(file)
    })
  }
}

// Exemple d'utilisation:
// import { mockAPI } from './utils/mockAPI'
// 
// // Sauvegarder
// await mockAPI.save({ floors: [...], timestamp: new Date() })
// 
// // Charger
// const data = await mockAPI.load()
// 
// // Exporter
// mockAPI.exportJSON(myData)
