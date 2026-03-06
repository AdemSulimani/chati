/**
 * Shërbimi i retrieval-it (RAG) — gjen dokumentet më relevante (produkte + FAQ)
 * për një mesazh të përdoruesit.
 *
 * Ky është versioni fillestar, me scoring të thjeshtë tekstual (pa embedding)
 * mbi një listë të vogël kandidatësh nga DB (jo krejt koleksioni).
 */

import {
  getProductById,
  getFaqById,
  searchProductsByText,
  searchFaqByTextOrKeywords,
} from './dataService.js';
import { searchDocumentsByText } from './searchIndexService.js';

// Prag minimal besueshmërie për një përputhje (score).
// Mund ta rregullosh më vonë në bazë të log-ëve.
const MIN_SCORE = 2;

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

  let products = [];
  let faqList = [];

  // Kërkim i parë mbi koleksionin SearchDocument (produkte + FAQ në një index të vetëm)
  const searchDocs = await searchDocumentsByText(userMessage, 50);

  if (searchDocs && searchDocs.length > 0) {
    const productIds = [];
    const faqIds = [];
    for (const doc of searchDocs || []) {
      if (!doc || !doc.type || !doc.refId) continue;
      if (doc.type === 'product') {
        productIds.push(String(doc.refId));
      } else if (doc.type === 'faq') {
        faqIds.push(String(doc.refId));
      }
    }

    const uniqueProductIds = [...new Set(productIds)];
    const uniqueFaqIds = [...new Set(faqIds)];

    const [productsRaw, faqListRaw] = await Promise.all([
      Promise.all(uniqueProductIds.map((id) => getProductById(id))),
      Promise.all(uniqueFaqIds.map((id) => getFaqById(id))),
    ]);

    products = productsRaw.filter(Boolean);
    faqList = faqListRaw.filter(Boolean);
  }

  // Nëse index-i i kërkimit nuk kthen asgjë, përdor fallback direkt mbi koleksionet Product / Faq
  if ((!products || products.length === 0) && (!faqList || faqList.length === 0)) {
    const [productsFallback, faqFallback] = await Promise.all([
      searchProductsByText(userMessage, 30),
      searchFaqByTextOrKeywords(userMessage, 30),
    ]);
    products = productsFallback || [];
    faqList = faqFallback || [];
  }

  // Scoring për produktet
  const productMatches = [];
  let maxProductScore = 0;
  for (const p of products || []) {
    const { score, matchedFields } = scoreProduct(p, queryTokens, normalizedMessage);
    if (score > 0) {
      productMatches.push({ product: p, score, matchedFields });
      if (score > maxProductScore) {
        maxProductScore = score;
      }
    }
  }

  // Scoring për FAQ
  const faqMatches = [];
  let maxFaqScore = 0;
  for (const f of faqList || []) {
    const { score, matchedFields } = scoreFaq(f, queryTokens, normalizedMessage);
    if (score > 0) {
      faqMatches.push({ faq: f, score, matchedFields });
      if (score > maxFaqScore) {
        maxFaqScore = score;
      }
    }
  }

  // Filtro sipas pragut të besueshmërisë (MIN_SCORE)
  const filteredProductMatches = productMatches.filter((m) => m.score >= MIN_SCORE);
  const filteredFaqMatches = faqMatches.filter((m) => m.score >= MIN_SCORE);

  const anyAboveThreshold =
    filteredProductMatches.length > 0 || filteredFaqMatches.length > 0;

  // Nëse asnjë dokument nuk kalon pragun → konsiderohet që retrieval nuk gjeti asgjë të mirë
  if (!anyAboveThreshold) {
    console.log('[RAG][retrievalService] no good match found above threshold', {
      userMessage: normalizedMessage,
      maxProductScore,
      maxFaqScore,
      maxScore: Math.max(maxProductScore, maxFaqScore, 0),
      minScoreThreshold: MIN_SCORE,
      productCandidates: products?.length || 0,
      faqCandidates: faqList?.length || 0,
    });

    return {
      products: [],
      faq: [],
    };
  }

  // Radhit sipas score dhe kufizo në max 3 (vetëm ato që kaluan pragun)
  filteredProductMatches.sort((a, b) => b.score - a.score);
  filteredFaqMatches.sort((a, b) => b.score - a.score);

  const topProducts = filteredProductMatches.slice(0, 3);
  const topFaq = filteredFaqMatches.slice(0, 3);

  // Logim i retrieval-it për observabilitet
  console.log('[RAG][retrievalService] retrieveRelevantContext result', {
    userMessage: normalizedMessage,
    productCandidates: products?.length || 0,
    faqCandidates: faqList?.length || 0,
    maxProductScore,
    maxFaqScore,
    maxScore: Math.max(maxProductScore, maxFaqScore, 0),
    minScoreThreshold: MIN_SCORE,
    productPassedThreshold: filteredProductMatches.length,
    faqPassedThreshold: filteredFaqMatches.length,
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

