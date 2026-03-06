/**
 * Shërbimi i të dhënave — lexon produkte dhe FAQ nga MongoDB.
 */

import Product from '../models/Product.js';
import Faq from '../models/Faq.js';

function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Kthen të gjitha fushat e produktit si objekt i thjeshtë (për kontekst te AI). */
function toPlainProduct(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const base = {
    id: String(o._id),
    name: o.name,
    description: o.description ?? '',
    price: o.price,
    stock: o.stock ?? 0,
    category: o.category ?? '',
    unit: o.unit ?? '',
    characteristics: o.characteristics ?? '',
    details: o.details ?? '',
  };
  // Çdo fushë tjetër nga DB (për të ardhmen) përfshihet në kontekst
  const known = new Set(['_id', 'id', 'name', 'description', 'price', 'stock', 'category', 'unit', 'characteristics', 'details', 'createdAt', 'updatedAt', '__v']);
  for (const key of Object.keys(o)) {
    if (known.has(key)) continue;
    base[key] = o[key];
  }
  return base;
}

function toPlainFaq(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id),
    type: o.type,
    keywords: Array.isArray(o.keywords) ? o.keywords : [],
    answer: o.answer ?? '',
  };
}

/**
 * Të gjitha produktet.
 */
export async function getProducts() {
  const docs = await Product.find().lean();
  return docs.map((d) => toPlainProduct(d));
}

/**
 * Produktet e një kategorie.
 */
export async function getProductsByCategory(category) {
  const normalized = normalizeText(category);
  const docs = await Product.find({
    category: { $regex: new RegExp(`^${normalized}$`, 'i') },
  }).lean();
  return docs.map((d) => toPlainProduct(d));
}

/**
 * Një produkt sipas id.
 */
export async function getProductById(id) {
  const doc = await Product.findById(id).lean();
  return toPlainProduct(doc);
}

/**
 * Produktet që janë në stok (stock > 0).
 */
export async function getProductsInStock() {
  const docs = await Product.find({ stock: { $gt: 0 } }).lean();
  return docs.map((d) => toPlainProduct(d));
}

/**
 * Të gjitha hyrjet FAQ.
 */
export async function getFaq() {
  const docs = await Faq.find().lean();
  return docs.map((d) => toPlainFaq(d));
}

/**
 * Një FAQ sipas id.
 */
export async function getFaqById(id) {
  const doc = await Faq.findById(id).lean();
  return toPlainFaq(doc);
}

/**
 * Gjen një FAQ që përputhet me mesazhin e përdoruesit (keyword më i gjatë që përputhet).
 */
export async function findFaqByMessage(userMessage) {
  if (!userMessage || String(userMessage).trim() === '') return null;
  const normalized = normalizeText(userMessage);
  const faqList = await getFaq();
  let best = null;
  let bestLen = 0;

  for (const entry of faqList) {
    const keywords = entry.keywords || [];
    for (const kw of keywords) {
      const k = normalizeText(kw);
      const matches = normalized.includes(k) || k.includes(normalized);
      if (matches && k.length > bestLen) {
        bestLen = k.length;
        best = entry;
      }
    }
  }
  return best;
}

/**
 * Kërkim i produkteve sipas tekstit (emër + përshkrim + kategori + fushat e tjera tekstuale).
 * Përdor regex case-insensitive në disa fusha dhe kthen një listë të vogël kandidatësh.
 *
 * Ky funksion NUK zëvendëson getProducts; është për retrieval më inteligjent.
 *
 * @param {string} query - teksti nga userMessage
 * @param {number} [limit=30] - maksimumi i dokumenteve që kthehen
 */
export async function searchProductsByText(query, limit = 30) {
  if (!query || String(query).trim() === '') return [];

  const trimmed = String(query).trim();
  const regex = new RegExp(escapeRegex(trimmed), 'i');

  const docs = await Product.find({
    $or: [
      { name: regex },
      { description: regex },
      { category: regex },
      { unit: regex },
      { characteristics: regex },
      { details: regex },
    ],
  })
    .limit(limit)
    .lean();

  return docs.map((d) => toPlainProduct(d));
}

/**
 * Kërkim në FAQ duke përdorur si keywords ashtu edhe tekstin e plotë të përgjigjes.
 * Përdor regex case-insensitive për të gjetur një listë të vogël kandidatësh.
 *
 * @param {string} query - teksti nga userMessage
 * @param {number} [limit=30] - maksimumi i dokumenteve që kthehen
 */
export async function searchFaqByTextOrKeywords(query, limit = 30) {
  if (!query || String(query).trim() === '') return [];

  const trimmed = String(query).trim();
  const regex = new RegExp(escapeRegex(trimmed), 'i');

  const docs = await Faq.find({
    $or: [
      { type: regex },
      { answer: regex },
      { keywords: { $elemMatch: { $regex: regex } } },
    ],
  })
    .limit(limit)
    .lean();

  return docs.map((d) => toPlainFaq(d));
}
