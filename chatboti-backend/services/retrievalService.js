/**
 * Shërbimi i retrieval-it (RAG) — gjen dokumentet më relevante (produkte + FAQ)
 * për një mesazh të përdoruesit.
 *
 * Ky është versioni fillestar, me scoring të thjeshtë tekstual (pa embedding)
 * mbi një listë të vogël kandidatësh nga DB (jo krejt koleksioni).
 */

import {
  searchProductsByText,
  searchFaqByTextOrKeywords,
} from './dataService.js';

function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreField(fieldValue, queryTokens) {
  if (!fieldValue) return 0;
  const field = normalizeText(fieldValue);
  if (!field) return 0;

  let score = 0;
  for (const token of queryTokens) {
    if (!token) continue;
    if (field.includes(token)) {
      score += 1;
    }
  }
  return score;
}

/**
 * Llogarit një score të thjeshtë për një produkt bazuar në përputhjen me userMessage.
 */
function scoreProduct(product, queryTokens, normalizedMessage) {
  let score = 0;
  const matchedFields = [];

  // Fushat kryesore
  const nameScore = scoreField(product.name, queryTokens);
  if (nameScore > 0) {
    score += nameScore * 2; // emri ka peshë më të madhe
    matchedFields.push('name');
  }

  const descScore = scoreField(product.description, queryTokens);
  if (descScore > 0) {
    score += descScore;
    matchedFields.push('description');
  }

  const categoryScore = scoreField(product.category, queryTokens);
  if (categoryScore > 0) {
    score += categoryScore;
    matchedFields.push('category');
  }

  const charScore = scoreField(product.characteristics, queryTokens);
  if (charScore > 0) {
    score += charScore;
    matchedFields.push('characteristics');
  }

  const detailsScore = scoreField(product.details, queryTokens);
  if (detailsScore > 0) {
    score += detailsScore;
    matchedFields.push('details');
  }

  // Bonus nëse emri i produktit përputhet si frazë brenda mesazhit
  if (product.name) {
    const normName = normalizeText(product.name);
    if (normName && normalizedMessage.includes(normName)) {
      score += 5;
      if (!matchedFields.includes('name')) matchedFields.push('name');
    }
  }

  return { score, matchedFields };
}

/**
 * Llogarit score për një FAQ bazuar në keywords dhe përgjigje.
 */
function scoreFaq(faq, queryTokens, normalizedMessage) {
  let score = 0;
  const matchedFields = [];

  // Keywords: nëse mesazhi përmban një keyword, jep bonus
  const keywords = Array.isArray(faq.keywords) ? faq.keywords : [];
  for (const kw of keywords) {
    const k = normalizeText(kw);
    if (!k) continue;
    if (normalizedMessage.includes(k)) {
      score += Math.max(3, k.split(' ').length); // fjali më të gjata marrin pak më shumë peshë
      if (!matchedFields.includes('keywords')) matchedFields.push('keywords');
    }
  }

  // Përputhje me tekstin e përgjigjes
  const answerScore = scoreField(faq.answer, queryTokens);
  if (answerScore > 0) {
    score += answerScore;
    matchedFields.push('answer');
  }

  return { score, matchedFields };
}

/**
 * Retrieval i thjeshtë: pranon userMessage dhe kthen:
 * - një listë të vogël (maks. 3) produktesh relevante,
 * - një listë të vogël (maks. 3) FAQ-sh relevante,
 * - si dhe score + arsyet pse janë zgjedhur.
 *
 * Kjo strukturë përdoret si "context" për AI:
 *
 * {
 *   products: [
 *     { product: <ProductPlain>, score: number, matchedFields: string[] },
 *     ...
 *   ],
 *   faq: [
 *     { faq: <FaqPlain>, score: number, matchedFields: string[] },
 *     ...
 *   ]
 * }
 *
 * @param {string} userMessage
 * @returns {Promise<{
 *   products: Array<{ product: any, score: number, matchedFields: string[] }>,
 *   faq: Array<{ faq: any, score: number, matchedFields: string[] }>
 * }>}
 */
export async function retrieveRelevantContext(userMessage) {
  const normalizedMessage = normalizeText(userMessage || '');
  const queryTokens = tokenize(normalizedMessage);

  // Përdor kërkimet e reja nga dataService për të marrë një listë të vogël kandidatësh
  const [products, faqList] = await Promise.all([
    searchProductsByText(userMessage, 50),
    searchFaqByTextOrKeywords(userMessage, 50),
  ]);

  // Scoring për produktet
  const productMatches = [];
  for (const p of products || []) {
    const { score, matchedFields } = scoreProduct(p, queryTokens, normalizedMessage);
    if (score > 0) {
      productMatches.push({ product: p, score, matchedFields });
    }
  }

  // Scoring për FAQ
  const faqMatches = [];
  for (const f of faqList || []) {
    const { score, matchedFields } = scoreFaq(f, queryTokens, normalizedMessage);
    if (score > 0) {
      faqMatches.push({ faq: f, score, matchedFields });
    }
  }

  // Radhit sipas score dhe kufizo në max 3
  productMatches.sort((a, b) => b.score - a.score);
  faqMatches.sort((a, b) => b.score - a.score);

  const topProducts = productMatches.slice(0, 3);
  const topFaq = faqMatches.slice(0, 3);

  // Logim i retrieval-it për observabilitet
  console.log('[RAG][retrievalService] retrieveRelevantContext result', {
    userMessage: normalizedMessage,
    productCandidates: products?.length || 0,
    faqCandidates: faqList?.length || 0,
    topProducts: topProducts.map(({ product, score, matchedFields }) => ({
      id: product.id,
      name: product.name,
      score,
      matchedFields,
    })),
    topFaq: topFaq.map(({ faq, score, matchedFields }) => ({
      id: faq.id,
      type: faq.type,
      score,
      matchedFields,
    })),
  });

  return {
    products: topProducts,
    faq: topFaq,
  };
}

