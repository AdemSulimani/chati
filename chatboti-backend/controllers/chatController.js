/**
 * Kontrolleri i chat-it — merr mesazhin e përdoruesit dhe kthen përgjigjen e botit.
 * Hapi A: përputhje me keyword/FAQ → përgjigje nga data (produkte, stok, shipping, kthime, oferta).
 * Hapi B: nëse nuk ka përputhje → thirrje te AI API; nëse AI nuk është i konfiguruar ose dështon → mesazh fallback.
 */

import {
  findFaqByMessage,
  getProducts,
  getProductsInStock,
} from '../services/dataService.js';
import { getAiReply, isAiConfigured } from '../services/aiService.js';

export async function postMessage(req, res, next) {
  try {
    const { text } = req.body ?? {};

    if (text == null || String(text).trim() === '') {
      return res.status(400).json({
        error: 'Fusha "text" (mesazhi) është e detyrueshme dhe nuk duhet të jetë bosh.',
      });
    }

    const userMessage = String(text).trim();
    let botReply;

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
    } else {
      if (isAiConfigured()) {
        try {
          botReply = await getAiReply(userMessage);
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

    res.status(200).json({ text: botReply });
  } catch (err) {
    next(err);
  }
}
