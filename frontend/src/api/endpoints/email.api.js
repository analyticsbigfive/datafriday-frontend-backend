// Envoi d'emails fournisseurs via la Supabase Edge Function `send-supplier-email`
// (qui appelle Resend côté serveur — la clé Resend reste un secret Supabase).
import { supabase } from '@/lib/supabase'

/**
 * @param {{
 *   supplierName: string,
 *   supplierEmail?: string,
 *   spaceLabel?: string,
 *   items: Array<{ itemName: string, quantityLabel: string, shopNames?: string[] }>
 * }} payload
 * @returns {Promise<{ id: string|null, to: string }>}
 */
export async function sendSupplierEmail(payload) {
  const { data, error } = await supabase.functions.invoke('send-supplier-email', {
    body: payload,
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}
