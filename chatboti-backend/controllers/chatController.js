/**
 * Kontrolleri i chat-it — merr mesazhin e përdoruesit dhe kthen përgjigjen e botit.
 *
 * RADHA E RE E EKZEKUTIMIT (me RAG):
 * Hapi 1: Kontrollo nëse mesazhi është bosh ose i padëgjuar (validacion).
 * Hapi 2: Intent / FAQ detection — kontrollo përputhje të fortë me FAQ (keyword). Nëse ka përputhje → përgjigje direkt nga DB (+ listë produktesh/stoku sipas nevojës), pa thirrur AI.
 * Hapi 3: Nëse nuk ka përputhje FAQ, kontrollo nëse mesazhi është "jashtë temës / pa kuptim". Nëse po → kthej mesazhin e shkurtër; mos thirr AI.
 * Hapi 4: Nëse mesazhi është "në temë" dhe pa përputhje të fortë FAQ, bëj retrieval nga DB (produkte + FAQ), zgjidh 1–3 rezultate më relevante për këtë pyetje, ndërto context dhe thirr AI vetëm me ato rezultate (jo me krejt DB).
 * Hapi 5: Kthej përgjigjen te klienti.
 */

import {
  findFaqByMessage,
  getProducts,
  getProductsInStock,
} from '../services/dataService.js';
import { retrieveRelevantContext } from '../services/retrievalService.js';
import { getAiReply, isAiConfigured } from '../services/aiService.js';

/** Mesazhi i vetëm që kthehet kur përdoruesi dërgon diçka pa kuptim ose jashtë temës. */
const OFF_TOPIC_MESSAGE =
  'Nuk mund të ndihmoj me këtë temë. Ju lutemi bëni pyetje lidhur me produktet, çmimet, dërgesën, kthimet ose informacionin e dyqanit.';

/**
 * Kontrollon nëse mesazhi është pa kuptim ose dukshëm jashtë temës (vetëm emoji, numra, shumë e shkurtër, pa shkronja).
 * Në këto raste nuk thirret AI; kthehet mesazhi i shkurtër OFF_TOPIC_MESSAGE.
 */
function isMeaninglessOrOffTopic(text) {
  const s = String(text).trim();
  if (s.length < 3) return true;
  // Pa asnjë shkronjë (përfshirë shqip: ë, ç) → vetëm numra, emoji, simbole
  if (!/\p{L}/u.test(s)) return true;
  // Vetëm numra dhe hapësira/pikësim
  if (/^[\d\s.,!?\-:;]+$/.test(s)) return true;
  return false;
}

/**
 * Intent detection i thjeshtë: vendos nëse mesazhi ka gjasa të jetë
 * për produkte/faq/dyqan (pra vlen të provojmë retrieval) apo është
 * jashtë temës së dyqanit.
 *
 * Përdor rregulla të thjeshta mbi tekstin:
 * - fjalë kyçe rreth çmimit, stokut, porosisë, dërgesës, kthimeve, ofertave
 * - fjalë kyçe për suplemente/fitnes (proteinë, kreatinë, whey, etj.)
 */
function detectIntent(userMessage) {
  const s = String(userMessage || '').toLowerCase();
  const normalized = s
    .replace(/\s+/g, ' ')
    .trim();

  const domainKeywords = [
    // Çmim / pagesë
    'çmim',
    'cmim',
    'çmimi',
    'cmimi',
    'sa kushton',
    'kushton',
    'kosto',
    // Stok / disponueshmëri
    'stok',
    'disponib',
    'ka ne stok',
    'ka në stok',
    // Porosi / blerje
    'porosi',
    'porosit',
    'blej',
    'blerje',
    'checkout',
    'pagese',
    'pagesë',
    // Dërgesë / transport
    'dërges',
    'derges',
    'transport',
    'postë',
    'poste',
    'delivery',
    // Kthime / garanci
    'kthim',
    'kthime',
    'refund',
    'rimbursim',
    'garanci',
    // Oferta / ulje
    'ofert',
    'zbritje',
    'ulje çmimi',
    'akcione',
    // Produkte / dyqan
    'produkt',
    'produktet',
    'artikull',
    'artikuj',
    'dyqan',
    'shop',
    'proteinplus',
    // Suplemente / fitnes
    'protein',
    'proteina',
    'whey',
    'kreatin',
    'creatina',
    'bcaa',
    'pre workout',
    'pre-workout',
    'amin',
    'amino',
    'gainer',
    'mass',
    'shaker',
  ];

  const matchedKeywords = domainKeywords.filter((kw) => normalized.includes(kw));
  const hasDomainKeyword = matchedKeywords.length > 0;

  // Heuristikë e thjeshtë shtesë: pyetje relativisht e gjatë me pikëpyetje,
  // edhe pa keyword specifik, mund të konsiderohet relevante.
  const wordCount = normalized ? normalized.split(' ').filter(Boolean).length : 0;
  const hasQuestionMark = normalized.includes('?');
  const looksLikeQuestion = hasQuestionMark && wordCount >= 4;

  const isRelevant = hasDomainKeyword || looksLikeQuestion;

  return {
    isRelevant,
    matchedKeywords,
  };
}

/**
 * Hapi 4 – përdor retrievalService për të marrë një nën‑set të vogël
 * dokumentesh relevante (produkte + FAQ) dhe ndërton context për AI.
 */
async function buildRagContext(userMessage) {
  const { products = [], faq = [] } = await retrieveRelevantContext(userMessage);

  const topProductDocs = products.map((p) => p.product);
  const topFaqDocs = faq.map((f) => ({
    type: f.faq.type,
    answer: f.faq.answer,
  }));

  if (!topProductDocs.length && !topFaqDocs.length) {
    return null;
  }

  return {
    products: topProductDocs,
    faq: topFaqDocs,
  };
}

export async function postMessage(req, res, next) {
  try {
    const { text } = req.body ?? {};

    // ——— Hapi 1: Validacion ———
    if (text == null || String(text).trim() === '') {
      return res.status(400).json({
        error: 'Fusha "text" (mesazhi) është e detyrueshme dhe nuk duhet të jetë bosh.',
      });
    }

    const userMessage = String(text).trim();
    const intent = detectIntent(userMessage);
    // Logim bazë për çdo mesazh të ardhur në chat
    console.log('[Chat] New message', { userMessage, intent });
    let botReply;

    // ——— Hapi 2: Intent / Përputhje me FAQ (keyword, "përputhje e fortë") ———
    const faq = await findFaqByMessage(userMessage);
    if (faq) {
      botReply = faq.answer;
      if (faq.type === 'produkte') {
        const products = await getProducts();
        const list = products
          .slice(0, 5)
          .map((p) => `• ${p.name} — ${p.price}€ (${p.stock > 0 ? 'në stok' : 'jashtë stokut'})`)
          .join('\n');
        if (list) botReply += '\n\nProdukte të disponueshme:\n' + list;
      }
      if (faq.type === 'stok') {
        const inStock = await getProductsInStock();
        const names = inStock.slice(0, 8).map((p) => p.name).join(', ');
        if (names) botReply += '\n\nAktualisht në stok (p.sh.): ' + names + (inStock.length > 8 ? '...' : '.');
      }
      // Logim: përgjigje direkte nga FAQ, pa AI
      console.log('[Chat] Responding from FAQ only', {
        userMessage,
        faqId: faq.id,
        faqType: faq.type,
      });
    }
    // ——— Hapi 3: Jashtë temës / pa kuptim → mesazh i shkurtër, pa thirrje AI ———
    else if (isMeaninglessOrOffTopic(userMessage) || !intent.isRelevant) {
      botReply = OFF_TOPIC_MESSAGE;
      console.log('[Chat] Off-topic or meaningless message filtered', {
        userMessage,
        intent,
      });
    }
    // ——— Hapi 4: Mesazhi "në temë", pa përputhje të fortë FAQ → RAG retrieval + AI ———
    else {
      if (isAiConfigured()) {
        try {
          // Retrieval: merr një nën‑set të vogël (1–3) dokumentesh nga DB
          // (produkte + FAQ) dhe përdor vetëm ato si kontekst për AI
          // në vend se t’ia dërgojmë krejt DB‑në.
          const context = await buildRagContext(userMessage);

          if (!context) {
            // Nëse nuk gjendet asgjë relevante në DB, lejojmë AI të përgjigjet
            // vetëm me system prompt të përgjithshëm (pa kontekst nga DB).
            console.log('[Chat] Using AI without DB context (no retrieval hits)', {
              userMessage,
            });
            botReply = await getAiReply(userMessage);
          } else {
            console.log('[Chat] Using AI with RAG context', {
              userMessage,
              contextProductCount: context.products?.length || 0,
              contextFaqCount: context.faq?.length || 0,
            });
            botReply = await getAiReply(userMessage, undefined, context);
          }
        } catch (aiErr) {
          console.error('AI API gabim:', aiErr.message);
          botReply =
            'Nuk mund të lidhem me shërbimin e përgjigjeve automatikë. Ju lutemi provoni përsëri ose formuloni pyetjen ndryshe.';
        }
      } else {
        botReply =
          'Pyetja juaj nuk përputhet me tematikat e zakonshme (produkte, stok, dërgesë, kthime, oferta). Për përgjigje me AI, vendosni AI_API_KEY në konfigurimin e serverit.';
      }
    }

    // ——— Hapi 5: Kthej përgjigjen te klienti ———
    res.status(200).json({ text: botReply });
  } catch (err) {
    next(err);
  }
}
