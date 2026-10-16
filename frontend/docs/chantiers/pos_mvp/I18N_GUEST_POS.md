# Traductions de la caisse invitée (lot L7, Front B)

Clés utilisées par `frontend/src/components/guest-pos/**`, `frontend/src/composables/useGuestPos*.js`,
`frontend/src/utils/posErrors.js` et `frontend/src/views/PinLoginView.vue`, à fusionner dans
`frontend/src/i18n/translations.js` (blocs `en` et `fr`) par l'agent central. Les marques `{...}`
sont des paramètres remplacés dans le code par `.replace('{nom}', valeur)`.

| Clé | FR | EN |
|---|---|---|
| guestPosLoginTitle | Accès caisse | Till access |
| guestPosLoginSubtitle | Saisissez votre nom et le code PIN de ce point de vente pour ouvrir la caisse. | Enter your name and the PIN of this point of sale to open the till. |
| guestPosLoginVendorLabel | Votre nom (vendeur) | Your name (seller) |
| guestPosLoginVendorPlaceholder | Ex. Awa K. | E.g. Awa K. |
| guestPosLoginVendorRequired | Saisissez votre nom pour ouvrir la caisse. | Enter your name to open the till. |
| guestPosErrorEventEnded | Cet évènement est terminé : la caisse n'est plus disponible. | This event is over: the till is no longer available. |
| guestPosErrorStopped | La caisse de ce point de vente est arrêtée. Contactez le responsable. | The till of this point of sale is stopped. Contact the manager. |
| guestPosErrorNotInConfig | Ce point de vente ne fait pas partie de la configuration de l'évènement. | This point of sale is not part of the event configuration. |
| guestPosErrorItemNotOnPdv | Un article du ticket n'est pas vendu sur ce point de vente. | An item on the ticket is not sold at this point of sale. |
| guestPosErrorPaymentDisabled | Ce moyen de paiement n'est pas disponible pour cet évènement. | This payment method is not available for this event. |
| guestPosErrorCancelDisabled | L'annulation des ventes est désactivée pour cet évènement. | Cancelling sales is disabled for this event. |
| guestPosErrorVendorRequired | Saisissez votre nom pour ouvrir la caisse. | Enter your name to open the till. |
| guestPosErrorEmptyTicket | Le ticket est vide. | The ticket is empty. |
| guestPosErrorInvalidLine | Une ligne du ticket est invalide (quantité de 1 à 999). | A ticket line is invalid (quantity from 1 to 999). |
| guestPosErrorPaymentMismatch | La somme des paiements ne correspond pas au total du ticket. | The payments do not add up to the ticket total. |
| guestPosErrorTicketConflict | Ce ticket est déjà en cours d'envoi, patientez un instant. | This ticket is already being sent, please wait a moment. |
| guestPosErrorTipsDisabled | Les pourboires ne sont pas acceptés pour cet évènement. | Tips are not accepted for this event. |
| guestPosErrorInvalidTip | Pourboire invalide. | Invalid tip. |
| guestPosErrorNetwork | Réseau indisponible. Vérifiez la connexion puis réessayez. | Network unavailable. Check the connection and try again. |
| guestPosErrorGeneric | Une erreur est survenue. Réessayez. | Something went wrong. Please try again. |
| guestPosLoading | Chargement de la caisse... | Loading the till... |
| guestPosRetry | Réessayer | Retry |
| guestPosLeave | Quitter la caisse | Leave the till |
| guestPosBack | Retour | Back |
| guestPosClose | Fermer | Close |
| guestPosMenuLabel | Menu de la caisse | Till menu |
| guestPosMenuVendor | Vendeur : | Seller: |
| guestPosMenuHistory | Historique des ventes | Sales history |
| guestPosMenuClosing | Clôture de caisse | Till closing |
| guestPosMenuExitFullscreen | Quitter le plein écran | Exit full screen |
| guestPosMenuEnterFullscreen | Passer en plein écran | Enter full screen |
| guestPosSyncLive | En direct | Live |
| guestPosSyncPending | {count} vente(s) en attente d'envoi | {count} sale(s) waiting to be sent |
| guestPosSyncOffline | Hors ligne, {count} en attente | Offline, {count} waiting |
| guestPosCategories | Catégories | Categories |
| guestPosNoItems | Aucun article dans cette catégorie. | No items in this category. |
| guestPosOutOfStock | Épuisé | Out of stock |
| guestPosLowStock | Stock bas | Low stock |
| guestPosTicketTitle | Ticket n° {number} | Ticket no. {number} |
| guestPosTicketClear | Vider | Clear |
| guestPosTicketEmpty | Touchez un article pour commencer le ticket | Tap an item to start the ticket |
| guestPosLineUnit | {price} l'unité | {price} each |
| guestPosLineInsteadOf | Au lieu de {price} | Instead of {price} |
| guestPosLineRemove | Retirer une unité | Remove one unit |
| guestPosLineAdd | Ajouter une unité | Add one unit |
| guestPosTotal | Total | Total |
| guestPosVat | dont TVA {amount} | incl. VAT {amount} |
| guestPosTip | Pourboire | Tip |
| guestPosTipNone | Aucun | None |
| guestPosTipAmount | Montant | Amount |
| guestPosTipAmountPlaceholder | Montant en euros | Amount in euros |
| guestPosTipNote | Pourboire de {amount} ajouté au dernier paiement, hors chiffre d'affaires et hors TVA | Tip of {amount} added to the last payment, outside revenue and VAT |
| guestPosNoPaymentMethod | Aucun moyen de paiement n'est disponible pour cette caisse. | No payment method is available for this till. |
| guestPosSplit | Partager l'addition | Split the bill |
| guestPosSplitTitle | Partager l'addition | Split the bill |
| guestPosSplitEqual | Parts égales | Equal shares |
| guestPosSplitByAmount | Montant par montant | Amount by amount |
| guestPosSplitPeople | Nombre de personnes | Number of people |
| guestPosSplitFewer | Une personne de moins | One person fewer |
| guestPosSplitMore | Une personne de plus | One person more |
| guestPosSplitPart | Part {number} | Share {number} |
| guestPosSplitTheRest | Le reste | The rest |
| guestPosSplitCustom | Autre montant | Other amount |
| guestPosSplitCustomPlaceholder | Autre montant en euros | Other amount in euros |
| guestPosSplitAdd | Ajouter | Add |
| guestPosSplitRemove | Retirer ce paiement | Remove this payment |
| guestPosSplitRest | Reste à payer | Left to pay |
| guestPosSplitConfirm | Encaisser | Charge |
| guestPosPaymentShared | Partagé | Split |
| guestPosBannerTitle | Ticket n° {number} encaissé, {total} | Ticket no. {number} charged, {total} |
| guestPosBannerUndo | Annuler la vente | Cancel the sale |
| guestPosBannerPayments | {count} paiements | {count} payments |
| guestPosBannerTip | pourboire {amount} | tip {amount} |
| guestPosBannerSent | envoyé en direct | sent live |
| guestPosBannerQueued | mis en file, envoi dès le retour du réseau | queued, sent as soon as the network is back |
| guestPosHistoryTitle | Historique des ventes | Sales history |
| guestPosHistorySummary | {tickets} tickets · {total} · {cancelled} annulé(s) | {tickets} tickets · {total} · {cancelled} cancelled |
| guestPosHistorySearch | N° de ticket ou vendeur | Ticket no. or seller |
| guestPosHistorySearchLabel | Rechercher un ticket | Search a ticket |
| guestPosHistoryAll | Tous | All |
| guestPosHistoryCancelled | Annulés | Cancelled |
| guestPosHistoryNone | Aucun ticket ne correspond. | No ticket matches. |
| guestPosHistoryMore | Charger les tickets suivants | Load more tickets |
| guestPosHistorySelect | Sélectionnez un ticket | Select a ticket |
| guestPosHistoryTicket | N° {number} | No. {number} |
| guestPosHistoryVendor | Vendeur : {name} | Seller: {name} |
| guestPosHistoryPayments | Paiements | Payments |
| guestPosHistoryTip | pourboire {amount} | tip {amount} |
| guestPosHistoryCancel | Annuler le ticket | Cancel the ticket |
| guestPosHistoryRestore | Rétablir le ticket | Restore the ticket |
| guestPosHistoryDismiss | Écarter ce ticket refusé | Dismiss this rejected ticket |
| guestPosStatusSynced | Synchronisé | Synced |
| guestPosStatusPending | En attente d'envoi | Waiting to be sent |
| guestPosStatusRejected | Refusé par le serveur | Rejected by the server |
| guestPosStatusCancelled | Annulé | Cancelled |
| guestPosClosingTitle | Clôture de caisse | Till closing |
| guestPosClosingSubtitle | Récapitulatif des ventes de ce point de vente pour l'évènement. | Summary of the sales of this point of sale for the event. |
| guestPosClosingTickets | Tickets | Tickets |
| guestPosClosingVat | Dont TVA collectée | Of which VAT collected |
| guestPosClosingRevenue | Total des ventes TTC | Total sales incl. VAT |
| guestPosClosingTips | Pourboires (hors chiffre d'affaires) | Tips (outside revenue) |
| guestPosClosingTipsOf | dont {name} | of which {name} |
| guestPosClosingCancelled | Tickets annulés | Cancelled tickets |
| guestPosClosingPending | {count} vente(s) en attente d'envoi : la sortie est bloquée tant qu'elles ne sont pas parties. | {count} sale(s) waiting to be sent: leaving is blocked until they are sent. |
| guestPosClosingAllSynced | Toutes les ventes sont synchronisées. | All sales are synced. |
| guestPosClosingLeave | Quitter la caisse | Leave the till |

Notes pour la fusion :

- Les libellés des moyens de paiement (Espèces, Carte...) ne sont PAS des clés : ils viennent de l'API.
- `guestPosHistorySummary` utilise le séparateur « · » (point médian), pas un tiret.
- `guestPosVat` est aussi utilisée dans le détail d'un ticket de l'historique.
