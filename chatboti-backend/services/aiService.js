/**
 * Shërbimi AI — dërgon pyetjen te një API OpenAI-kompatibile (OpenAI, Groq, etj.)
 * kur nuk ka përputhje me FAQ. Përdor variabla mjedisi për API key dhe endpoint.
 */

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
const AI_API_URL = (process.env.AI_API_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const AI_MODEL = process.env.AI_MODEL || 'gpt-3.5-turbo';

/** System prompt pa kontekst (kur nuk ka të dhëna nga DB).
 *  RIGOROZ: mos shpik fakte; nëse mungon informacioni, thuaj që nuk e ke.
 */
const DEFAULT_SYSTEM_PROMPT =
  'Ti je asistenti virtual i një dyqani online (ProteinPlus). Përgjigju shkurt dhe miqësor në shqip.' +
  ' Mos shpik asnjë informacion faktik (si çmime, stok, përbërje, politika të sakta dërgese/kthimi) nëse nuk të jepet qartë në mesazhet e sistemit ose të asistentit.' +
  ' Nëse nuk ke informacion të mjaftueshëm nga sistemi për një pyetje konkrete, thuaj qartë që nuk e ke këtë informacion në sistem dhe sugjero që përdoruesi të kontaktojë suportin ose të pyesë ndryshe.';

/**
 * Formaton një produkt me të gjitha fushat për kontekst te AI (emër, përshkrim, çmim, stok, kategori, njësi, karakteristika, detaje, etj.).
 */
function formatProductForContext(p) {
  const parts = [
    `Emër: ${p.name}`,
    `Përshkrim: ${p.description || '-'}`,
    `Çmim: ${p.price}€`,
    `Stok: ${p.stock}`,
    `Kategori: ${p.category || '-'}`,
    `Njësi: ${p.unit || '-'}`,
  ];
  if (p.characteristics && String(p.characteristics).trim()) {
    parts.push(`Karakteristika: ${p.characteristics}`);
  }
  if (p.details && String(p.details).trim()) {
    parts.push(`Detaje: ${p.details}`);
  }
  // Çdo fushë tjetër (për të ardhmen)
  const known = new Set(['id', 'name', 'description', 'price', 'stock', 'category', 'unit', 'characteristics', 'details']);
  for (const key of Object.keys(p)) {
    if (known.has(key) || p[key] == null || p[key] === '') continue;
    parts.push(`${key}: ${typeof p[key] === 'object' ? JSON.stringify(p[key]) : p[key]}`);
  }
  return parts.join('. ');
}

/**
 * Ndërton system prompt me kontekst të SHKURTËR dhe shumë relevant
 * (produkte + FAQ) nga databaza, për RAG.
 *
 * AI duhet ta trajtojë këtë listë si:
 * - një nën‑set të vogël të katalogut (jo të gjitha produktet),
 * - burimin e vetëm për fakte rreth ÇMIMIT/STOKUT/PËRSHKRIMIT/DETAJEVE
 *   për produktet që shfaqen këtu.
 *
 * Për pyetje të tjera relevante për produktet/dyqanin, AI mund të japë
 * vetëm komente të përgjithshme, POR pa shpikur të dhëna të reja që nuk janë në këtë kontekst.
 * Mesazhet krejt jashtë temës janë filtruar më herët në Hapin 3.
 */
function buildSystemPromptWithContext(products, faqList) {
  const lines = [
    'Ti je asistenti virtual i dyqanit online ProteinPlus. Përgjigju shkurt dhe miqësor në shqip.',
    '',
    'KONTEKST I SHKURTËR (RAG): më poshtë ke vetëm disa produkte dhe disa FAQ shumë relevante për pyetjen, JO gjithë katalogun e dyqanit.',
    '',
    'RREGULLA PËR PËRDORIMIN E TË DHËNAVE:',
    '',
    '1. Për ÇMIM, STOK, PËRSHKRIM, DETAJE dhe KARAKTERISTIKA të produkteve: përdor VETËM të dhënat nga lista e produkteve më poshtë. Mos shpik asnjë numër, çmim, stok apo fakt për asnjë produkt.',
    '',
    '2. Nëse pyetja është për një produkt që NUK shfaqet në këtë listë të shkurtër, thuaj që nuk e ke në këtë rezultat/kontekst dhe ofro produkte alternative nga lista, ose sqarim të përgjithshëm.',
    '',
    '3. Pyetje pa informacion të drejtpërdrejtë në lista: mund të japësh vetëm këshilla shumë të përgjithshme (p.sh. rreth suplementeve në mënyrë abstrakte), por mos shpik ÇMIME, STOK, PËRBËRJE ose karakteristika konkrete që nuk janë shkruar qartë në këto të dhëna.',
    '',
    '4. Nëse nuk je i sigurt ose informacioni nuk gjendet në tekstin e kontekstit: thuaj qartë që nuk e ke këtë informacion në databazën aktuale dhe sugjero pyetje të tjera që lidhen me produktet, çmimet, dërgesën ose kthimet.',
    '',
    '--- PRODUKTET (rezultate të përzgjedhura nga databaza: emër, përshkrim, çmim, stok, kategori, njësi, karakteristika, detaje) ---',
  ];
  if (products && products.length) {
    products.forEach((p, i) => {
      lines.push('');
      lines.push(`[Produkt ${i + 1}] ${formatProductForContext(p)}`);
    });
  } else {
    lines.push('(Nuk ka produkte në listë.)');
  }
  if (faqList && faqList.length) {
    lines.push('');
    lines.push('--- INFORMACION I SHPEJTË (dërgesë, kthime, oferta) ---');
    faqList.forEach((f) => {
      lines.push(`- ${f.type}: ${f.answer}`);
    });
  }
  lines.push('');
  lines.push('--- Fund i të dhënave. Përdor vetëm këto të dhëna për fakte; mos shpik. ---');
  return lines.join('\n');
}

/**
 * Merr përgjigje nga AI.
 * - Nëse jepet context (produkte + FAQ), AI përdor vetëm ato të dhëna për produktet.
 * - Nëse jepet history, ai dërgohet si mesazhe user/assistant para mesazhit aktual.
 *
 * @param {string} userMessage - teksti i përdoruesit (mesazhi aktual)
 * @param {string} [systemPrompt] - përdoret vetëm nëse nuk jepet context
 * @param {{ products?: Array, faq?: Array<{type, answer}> }} [context] - të dhëna të SHKURTRA nga DB (subset RAG) për kontekst
 * @param {Array<{ role: 'user' | 'assistant', content: string }>} [history] - 3–5 mesazhet e fundit të bisedës
 * @returns {Promise<string>}
 */
export async function getAiReply(
  userMessage,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
  context = null,
  history = []
) {
  if (!AI_API_KEY || AI_API_KEY.trim() === '') {
    throw new Error('AI_API_KEY (ose OPENAI_API_KEY) nuk është vendosur në .env');
  }

  const hasContext = context && (context.products?.length || context.faq?.length);
  const systemContent = hasContext
    ? buildSystemPromptWithContext(context.products || [], context.faq || [])
    : systemPrompt;

  const url = `${AI_API_URL}/chat/completions`;

  const messages = [{ role: 'system', content: systemContent }];

  const safeHistory = Array.isArray(history) ? history : [];
  for (const m of safeHistory) {
    if (!m || !m.role || !m.content) continue;
    messages.push({
      role: m.role,
      content: String(m.content),
    });
  }

  messages.push({ role: 'user', content: userMessage });

  const body = {
    model: AI_MODEL,
    messages,
    max_tokens: 500,
    // Temperaturë shumë e ulët që të minimizohet "shpikja" e informatave.
    temperature: 0,
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
