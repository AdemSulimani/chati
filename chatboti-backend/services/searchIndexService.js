import SearchDocument from '../models/SearchDocument.js';

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildProductSearchText(product) {
  if (!product) return '';
  const name = product.name || '';
  const category = product.category || '';
  const description = product.description || '';
  const characteristics = product.characteristics || '';
  const details = product.details || '';
  const price =
    typeof product.price === 'number' ? `price ${product.price}€` : '';
  const stock =
    typeof product.stock === 'number' ? `stock ${product.stock}` : '';

  return [
    name,
    category,
    description,
    characteristics,
    details,
    price,
    stock,
  ]
    .filter(Boolean)
    .join(' ');
}

function buildFaqSearchText(faq) {
  if (!faq) return '';
  const type = faq.type || '';
  const keywords = Array.isArray(faq.keywords) ? faq.keywords.join(' ') : '';
  const answer = faq.answer || '';
  return [type, keywords, answer].filter(Boolean).join(' ');
}

export async function indexProduct(product) {
  if (!product || !product._id) return;
  const text = buildProductSearchText(product);

  await SearchDocument.findOneAndUpdate(
    { type: 'product', refId: product._id },
    {
      type: 'product',
      refId: product._id,
      text,
      title: product.name || '',
      metadata: {
        category: product.category || '',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function removeProductFromIndex(productId) {
  if (!productId) return;
  await SearchDocument.deleteMany({ type: 'product', refId: productId });
}

export async function indexFaq(faq) {
  if (!faq || !faq._id) return;
  const text = buildFaqSearchText(faq);

  await SearchDocument.findOneAndUpdate(
    { type: 'faq', refId: faq._id },
    {
      type: 'faq',
      refId: faq._id,
      text,
      title: faq.type || '',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function removeFaqFromIndex(faqId) {
  if (!faqId) return;
  await SearchDocument.deleteMany({ type: 'faq', refId: faqId });
}

export async function searchDocumentsByText(query, limit = 50) {
  if (!query || String(query).trim() === '') return [];

  const trimmed = String(query).trim();
  const regex = new RegExp(escapeRegex(trimmed), 'i');

  const docs = await SearchDocument.find({
    text: regex,
  })
    .limit(limit)
    .lean();

  return docs;
}

