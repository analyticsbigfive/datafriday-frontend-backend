// Supabase Edge Function — envoi d'un email de commande fournisseur via Resend.
//
// Pourquoi côté serveur : la clé Resend ne doit jamais finir dans le bundle
// frontend, et l'API Resend (api.resend.com) refuse les appels navigateur (CORS).
// Le frontend invoque cette fonction via supabase.functions.invoke().
//
// Secrets Supabase :
//   RESEND_API_KEY        (requis)  — clé API Resend
//   EMAIL_FROM            (optionnel) — défaut "onboarding@resend.dev" (mode test)
//   EMAIL_TEST_RECIPIENT  (optionnel) — en mode test resend.dev, Resend n'autorise
//                                       l'envoi qu'à l'email du compte : on force
//                                       tous les "to" vers cette adresse. Une fois
//                                       un domaine vérifié, retirer ce secret +
//                                       définir EMAIL_FROM=commandes@votre-domaine.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string),
  );
}

interface SupplierItem {
  itemName?: string;
  quantityLabel?: string;
  shopNames?: string[];
}
interface Payload {
  supplierName?: string;
  supplierEmail?: string;
  spaceLabel?: string;
  items?: SupplierItem[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method-not-allowed" }, 405);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "RESEND_API_KEY secret manquant" }, 500);

  const from = Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev";
  const testRecipient = Deno.env.get("EMAIL_TEST_RECIPIENT") ?? "";

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "json-invalide" }, 400);
  }

  const supplierName = payload.supplierName || "Fournisseur";
  const spaceLabel = payload.spaceLabel || "";
  const items = Array.isArray(payload.items) ? payload.items : [];

  // Mode test resend.dev : tous les emails partent vers EMAIL_TEST_RECIPIENT.
  // Mode domaine vérifié : on envoie au vrai email fournisseur.
  const to = testRecipient || payload.supplierEmail || "";
  if (!to) return json({ error: "destinataire-absent" }, 400);
  if (!items.length) return json({ error: "aucun-article" }, 400);

  const subject =
    `Commande réapprovisionnement — ${spaceLabel} — ${supplierName}`;

  const rows = items
    .map((it) => {
      const shops = (it.shopNames || []).join(", ");
      return `<tr><td style="border:1px solid #cbd5e1;padding:6px 10px">${
        esc(it.itemName)
      }</td><td style="border:1px solid #cbd5e1;padding:6px 10px"><strong>${
        esc(it.quantityLabel)
      }</strong></td><td style="border:1px solid #cbd5e1;padding:6px 10px">${
        esc(shops)
      }</td></tr>`;
    })
    .join("");

  const testBanner = testRecipient && payload.supplierEmail &&
      payload.supplierEmail !== testRecipient
    ? `<p style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px">Mode test — destinataire réel prévu : <strong>${
      esc(payload.supplierEmail)
    }</strong></p>`
    : "";

  const html = `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;color:#0f172a">
    <p>Bonjour ${esc(supplierName)},</p>
    ${testBanner}
    <p>Merci de préparer la commande de réapprovisionnement suivante pour «&nbsp;${
    esc(spaceLabel)
  }&nbsp;» :</p>
    <table style="border-collapse:collapse;font-size:14px">
      <thead><tr>
        <th style="border:1px solid #cbd5e1;padding:6px 10px;background:#f1f5f9;text-align:left">Article</th>
        <th style="border:1px solid #cbd5e1;padding:6px 10px;background:#f1f5f9;text-align:left">Quantité</th>
        <th style="border:1px solid #cbd5e1;padding:6px 10px;background:#f1f5f9;text-align:left">PdV</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Cordialement,</p>
  </body></html>`;

  const text = [
    `Bonjour ${supplierName},`,
    "",
    `Commande de réapprovisionnement pour « ${spaceLabel} » :`,
    "",
    ...items.map(
      (it) =>
        `- ${it.itemName} : ${it.quantityLabel}` +
        ((it.shopNames || []).length ? ` (${it.shopNames!.join(", ")})` : ""),
    ),
    "",
    "Cordialement,",
  ].join("\n");

  const resp = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return json({ error: "resend-error", detail: data }, resp.status);
  }
  return json({ id: data.id ?? null, to });
});
