/**
 * Shërbimi AI — dërgon pyetjen te një API OpenAI-kompatibile (OpenAI, Groq, etj.)
 * kur nuk ka përputhje me FAQ. Përdor variabla mjedisi për API key dhe endpoint.
 */

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
const AI_API_URL = (process.env.AI_API_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const AI_MODEL = process.env.AI_MODEL || 'gpt-3.5-turbo';

/** System prompt pa kontekst (kur nuk ka të dhëna nga DB). */
const DEFAULT_SYSTEM_PROMPT =
  'Ti je asistenti virtual i një dyqani online (ProteinPlus). Përgjigju shkurt dhe miqësor në shqip. Nëse pyetja nuk ka të bëjë me produktet, dërgesën, kthimet apo dyqanin, thuaj politikesh që nuk ke informacion dhe ofro ndihmë për çfarë mund të përgjigjesh.';

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
 * Ndërton system prompt me kontekstin e plotë të produkteve (dhe FAQ) nga databaza.
 * AI e merr këtë si të dhëna zyrtare; rregullat e mëposhtme përcaktojnë përdorimin e DB.
 * Hapi 5: përdor vetëm këto të dhëna për çmim/stok/përshkrim/detaje; për pyetje të tjera relevante mund të përgjigjesh nga vetja por pa shpikur; jashtë temës është filtruar në Hapi 3.
 */
function buildSystemPromptWithContext(products, faqList) {
  const lines = [
    'Ti je asistenti virtual i dyqanit online ProteinPlus. Përgjigju shkurt dhe miqësor në shqip.',
    '',
    'HAPI 5 (rregulla kryesore): Përdor VETËM të dhënat e listës më poshtë për çmim, stok, përshkrim dhe detaje. Për pyetje të tjera relevante për produktet mund të përgjigjesh nga vetja, por pa shpikur të dhëna. Mesazhet jashtë temës janë të filtruara para se të arrijnë këtu (Hapi 3).',
    '',
    'RREGULLA TË DETYRUESHME PËR PËRDORIMIN E TË DHËNAVE:',
    '',
    '1. Për ÇMIM, STOK, PËRSHKRIM, DETAJE dhe KARAKTERISTIKA të produkteve: përdor VETËM të dhënat nga lista e produkteve më poshtë. Mos shpik asnjë numër, çmim, stok apo fakt — nëse diçka nuk është në listë, mos e thuaj.',
    '',
    '2. Kuptimi i pyetjes: edhe kur përdoruesi nuk e shkruan fjalën saktë (p.sh. "sa kushton", "çmimi", "sa është", "a e keni", "a ka", "sa kosto", "çfarë kushton"), kupto që bëhet fjalë për çmim, stok ose informacion produkti dhe përdor VETËM të dhënat nga lista. E njëjta vlen për çdo lloj informacioni që ke në listë (jo vetëm çmim): stok, përshkrim, detaje, karakteristika.',
    '',
    '3. Produkt që nuk është në listë: nëse pyetja është për një produkt që nuk shfaqet në listën e mëposhtme, thuaj që nuk e ke atë produkt në listë dhe ofro ndihmë — p.sh. të listosh produktet e disponueshme ose kategoritë.',
    '',
    '4. Pyetje pa informacion në listë/FAQ: kur pyetja nuk ka informacion përkatës në listën e produkteve ose në FAQ, mund të përdorësh aftësitë e tua për të përgjigjur, por VETËM nëse përgjigjja është e saktë dhe relevante për produktet/dyqanin (p.sh. këshilla të përgjithshme për suplemente, stërvitje, ushqim). Mos shpik kurrë të dhëna të reja për çmime, stok ose produkte — ato duhen vetëm nga lista.',
    '',
    '5. Nëse nuk je i sigurt ose përgjigjja nuk është relevante: thuaj që nuk ke informacion për këtë dhe ofro çfarë mund të ndihmojë (p.sh. informacion për produktet, çmime, dërgesë, kthime).',
    '',
    '--- PRODUKTET (të dhëna zyrtare nga databaza: emër, përshkrim, çmim, stok, kategori, njësi, karakteristika, detaje) ---',
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
 * Merr përgjigje nga AI. Nëse jepet context (produkte + FAQ), AI përdor vetëm ato të dhëna për produktet.
 *
 * @param {string} userMessage - teksti i përdoruesit
 * @param {string} [systemPrompt] - përdoret vetëm nëse nuk jepet context
 * @param {{ products?: Array, faq?: Array<{type, answer}> }} [context] - të dhëna nga DB për kontekst të plotë
 * @returns {Promise<string>}
 */
export async function getAiReply(userMessage, systemPrompt = DEFAULT_SYSTEM_PROMPT, context = null) {
  if (!AI_API_KEY || AI_API_KEY.trim() === '') {
    throw new Error('AI_API_KEY (ose OPENAI_API_KEY) nuk është vendosur në .env');
  }

  const hasContext = context && (context.products?.length || context.faq?.length);
  const systemContent = hasContext
    ? buildSystemPromptWithContext(context.products || [], context.faq || [])
    : systemPrompt;

  const url = `${AI_API_URL}/chat/completions`;
  const body = {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemContent },
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
