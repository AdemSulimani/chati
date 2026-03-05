/**
 * Kontrolleri i chat-it — merr mesazhin e përdoruesit dhe kthen përgjigjen e botit.
 *
 * RADHA E EKZEKUTIMIT:
 * Hapi 1: Kontrollo nëse mesazhi është bosh ose i padëgjuar (validacion).
 * Hapi 2: Kontrollo përputhje me FAQ (keyword). Nëse ka përputhje → përgjigje nga DB (+ listë produktesh/stoku sipas nevojës).
 * Hapi 3: Nëse nuk ka përputhje FAQ, vendos nëse mesazhi duhet konsideruar "jashtë temës / pa kuptim". Nëse po → kthej mesazhin e shkurtër; mos thirr AI.
 * Hapi 4: Nëse mesazhi është "në temë", merr nga DB produktet (dhe FAQ/informacion tjetër) me të gjitha fushat (përshkrim, detaje, karakteristika, çmim, stok, etj.) dhe dërgoji te AI si kontekst.
 * Hapi 5: Kthej përgjigjen te klienti.
 */

import {
  findFaqByMessage,
  getProducts,
  getProductsInStock,
  getFaq,
} from '../services/dataService.js';
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
    let botReply;

    // ——— Hapi 2: Përputhje me FAQ (keyword) ———
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
    }
    // ——— Hapi 3: Jashtë temës / pa kuptim → mesazh i shkurtër, pa thirrje AI ———
    else if (isMeaninglessOrOffTopic(userMessage)) {
      botReply = OFF_TOPIC_MESSAGE;
    }
    // ——— Hapi 4: Mesazhi "në temë" → merr nga DB produktet + FAQ me të gjitha fushat, dërgo te AI si kontekst ———
    else {
      if (isAiConfigured()) {
        try {
          // Produktet me të gjitha fushat (përshkrim, detaje, karakteristika, çmim, stok, kategori, njësi, etj.) + FAQ
          const [products, faqList] = await Promise.all([getProducts(), getFaq()]);
          const context = {
            products,
            faq: faqList.map((f) => ({ type: f.type, answer: f.answer })),
          };
          botReply = await getAiReply(userMessage, undefined, context);
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
