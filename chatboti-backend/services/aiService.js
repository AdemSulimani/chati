/**
 * Shërbimi AI — dërgon pyetjen te një API OpenAI-kompatibile (OpenAI, Groq, etj.)
 * kur nuk ka përputhje me FAQ. Përdor variabla mjedisi për API key dhe endpoint.
 */

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
const AI_API_URL = (process.env.AI_API_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const AI_MODEL = process.env.AI_MODEL || 'gpt-3.5-turbo';

/** System prompt që e përcakton rolin e asistentit (dyqan, gjuhë, ton). */
const DEFAULT_SYSTEM_PROMPT =
  'Ti je asistenti virtual i një dyqani online (ProteinPlus). Përgjigju shkurt dhe miqësor në shqip. Nëse pyetja nuk ka të bëjë me produktet, dërgesën, kthimet apo dyqanin, thuaj politikesh që nuk ke informacion dhe ofro ndihmë për çfarë mund të përgjigjesh.';

/**
 * Merr përgjigje nga AI për mesazhin e përdoruesit.
 * Thirrje te Chat Completions API (OpenAI / Groq / tjetër OpenAI-kompatibil).
 *
 * @param {string} userMessage - teksti i dërguar nga përdoruesi
 * @param {string} [systemPrompt] - opsional, për të override default
 * @returns {Promise<string>} - teksti i përgjigjes së asistentit
 * @throws {Error} nëse API key mungon ose API kthen gabim
 */
export async function getAiReply(userMessage, systemPrompt = DEFAULT_SYSTEM_PROMPT) {
  if (!AI_API_KEY || AI_API_KEY.trim() === '') {
    throw new Error('AI_API_KEY (ose OPENAI_API_KEY) nuk është vendosur në .env');
  }

  const url = `${AI_API_URL}/chat/completions`;
  const body = {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 500,
    temperature: 0.7,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = `AI API: ${res.status} ${res.statusText}`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.message) errMsg = errJson.error.message;
    } catch (_) {
      if (errText) errMsg += ' — ' + errText.slice(0, 200);
    }
    throw new Error(errMsg);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('AI API nuk ktheu përgjigje të vlefshme');
  }

  return String(choice.message.content).trim();
}

/**
 * Kontrollon nëse AI është i konfiguruar (ka API key).
 */
export function isAiConfigured() {
  return Boolean(AI_API_KEY && AI_API_KEY.trim() !== '');
}
