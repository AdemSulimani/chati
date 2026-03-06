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
import Conversation from '../models/Conversation.js';

/** Mesazhi i vetëm që kthehet kur përdoruesi dërgon diçka pa kuptim ose jashtë temës. */
const OFF_TOPIC_MESSAGE =
  'Nuk mund të ndihmoj me këtë temë. Ju lutemi bëni pyetje lidhur me produktet, çmimet, dërgesën, kthimet ose informacionin e dyqanit.';

/** Mesazh fallback kur retrieval nuk gjen asnjë informacion relevant në DB dhe nuk thirret AI. */
const FALLBACK_MESSAGE =
  'Nuk gjeta informacion për këtë pyetje në të dhënat tona. Një agjent do të përgjigjet së shpejti.';

/**
 * Përgatit historinë e bisedës për t'ia dërguar AI‑t:
 * merr mesazhet e fundit (user + assistant) në rend kronologjik,
 * me kufi në numrin e mesazheve dhe numrin total të karaktereve.
 */
function buildHistoryForAi(conversation, maxMessages = 5, maxChars = 2000) {
  if (!conversation || !Array.isArray(conversation.messages)) return [];

  const msgs = conversation.messages;
  const result = [];
  let totalChars = 0;

  // Ec nga fundi për të marrë mesazhet më të fundit, por ktheje në rend kronologjik
  for (let i = msgs.length - 1; i >= 0 && result.length < maxMessages; i--) {
    const m = msgs[i];
    if (!m || !m.role || !m.content) continue;
    const contentStr = String(m.content);
    const nextTotal = totalChars + contentStr.length;

    if (nextTotal > maxChars && result.length > 0) {
      break;
    }

    totalChars = nextTotal;
    // unshift për të ruajtur rendin më i vjetër → më i ri
    result.unshift({
      role: m.role,
      content: contentStr,
    });
  }

  return result;
}

function getLastAssistantMessage(conversation) {
  if (!conversation || !Array.isArray(conversation.messages)) return null;

  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const m = conversation.messages[i];
    if (!m || m.role !== 'assistant' || !m.content) continue;
    return String(m.content);
  }

  return null;
}

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
    'sa është',
    'sa eshte',
    'sa osht',
    'sa jane',
    'sa janë',
    'sa pare',
    'sa pare o',
    'sa kushton kjo',
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

function isShortPriceFollowUp(userMessage, lastAssistantMessage) {
  if (!userMessage || !lastAssistantMessage) return false;

  const msg = String(userMessage).toLowerCase().trim();
  const last = String(lastAssistantMessage).toLowerCase();

  const words = msg.split(' ').filter(Boolean);
  const wordCount = words.length;

  const containsSa = /\bsa\b/.test(msg);
  const isVeryShort = msg.length <= 20 || wordCount <= 3;

  const assistantMentionsPriceOrCurrency =
    last.includes('€') ||
    last.includes('çmim') ||
    last.includes('cmim') ||
    /\d+(\.\d+)?\s*€/.test(last);

  return containsSa && isVeryShort && assistantMentionsPriceOrCurrency;
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
    const { text, conversationId } = req.body ?? {};

    // ——— Hapi 1: Validacion ———
    if (text == null || String(text).trim() === '') {
      return res.status(400).json({
        error: 'Fusha "text" (mesazhi) është e detyrueshme dhe nuk duhet të jetë bosh.',
      });
    }

    const userMessage = String(text).trim();
    let botReply;
    let conversation = null;

    // Krijo ose gjej conversation sipas conversationId (nëse dërgohet nga frontend)
    if (conversationId) {
      try {
        conversation = await Conversation.findById(conversationId);
      } catch (_) {
        conversation = null;
      }
    }
    if (!conversation) {
      conversation = new Conversation();
      await conversation.save();
    }

    const lastAssistantMessage = getLastAssistantMessage(conversation);
    const baseIntent = detectIntent(userMessage);
    const shortFollowUp = isShortPriceFollowUp(userMessage, lastAssistantMessage);

    const intent = {
      ...baseIntent,
      isRelevant: baseIntent.isRelevant || shortFollowUp,
      matchedKeywords: shortFollowUp
        ? [...(baseIntent.matchedKeywords || []), 'followup_price']
        : baseIntent.matchedKeywords,
    };

    // Logim bazë për çdo mesazh të ardhur në chat
    console.log('[Chat] New message', {
      userMessage,
      intent,
      shortFollowUp,
      lastAssistantMessageSnippet: lastAssistantMessage
        ? String(lastAssistantMessage).slice(0, 200)
        : null,
    });

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
    else if (!shortFollowUp && (isMeaninglessOrOffTopic(userMessage) || !intent.isRelevant)) {
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
            // Nëse retrieval nuk gjen asgjë relevante në DB, MOS thirr AI.
            // Kthejmë një mesazh statik fallback për t'u ngritur te një agjent njerëzor.
            console.log('[Chat] Using fallback message instead of AI (no retrieval hits)', {
              userMessage,
              conversationId: conversation?._id?.toString(),
            });
            botReply = FALLBACK_MESSAGE;
          } else {
            const historyForAi = buildHistoryForAi(conversation);

            console.log('[Chat] Using AI with RAG context', {
              userMessage,
              contextProductCount: context.products?.length || 0,
              contextFaqCount: context.faq?.length || 0,
              historyLength: historyForAi.length,
              conversationId: conversation?._id?.toString(),
            });

            botReply = await getAiReply(userMessage, undefined, context, historyForAi);
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

    // ——— Ruaj historinë e bisedës (user + bot) ———
    if (conversation) {
      try {
        conversation.messages.push(
          { role: 'user', content: userMessage },
          { role: 'assistant', content: botReply }
        );
        await conversation.save();
      } catch (saveErr) {
        console.error('[Chat] Failed to save conversation history', {
          error: saveErr?.message,
        });
      }
    }

    // ——— Hapi 5: Kthej përgjigjen te klienti ———
    res.status(200).json({
      text: botReply,
      conversationId: conversation?._id?.toString() ?? null,
    });
  } catch (err) {
    next(err);
  }
}
