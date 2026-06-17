// Integração com a Evolution API (envio de WhatsApp). Se não estiver configurada,
// as mensagens são gravadas como PENDING (pronto-para-conectar), sem quebrar o fluxo.

export function isEvolutionConfigured() {
  const url = process.env.WHATSAPP_API_URL;
  const key = process.env.WHATSAPP_API_KEY;
  const instance = process.env.WHATSAPP_INSTANCE;
  // Considera não-configurado se forem os placeholders padrão.
  if (!url || !key || !instance) return false;
  if (/localhost:3001|your-api-key/.test(`${url}${key}`)) return false;
  return true;
}

// Envia uma mensagem de texto. Retorna { configured, ok }.
export async function sendWhatsappText(phone: string, text: string): Promise<{ configured: boolean; ok: boolean; error?: string }> {
  if (!isEvolutionConfigured()) return { configured: false, ok: false };
  try {
    const url = process.env.WHATSAPP_API_URL!.replace(/\/$/, '');
    const instance = process.env.WHATSAPP_INSTANCE!;
    const res = await fetch(`${url}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: process.env.WHATSAPP_API_KEY! },
      body: JSON.stringify({ number: phone.replace(/\D/g, ''), text }),
    });
    return { configured: true, ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e: any) {
    return { configured: true, ok: false, error: e?.message };
  }
}
