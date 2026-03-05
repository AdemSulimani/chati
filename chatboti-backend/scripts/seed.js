/**
 * Mbush MongoDB me produkte dhe FAQ nga data/products.json dhe data/faq.json.
 * Ekzekutoni: node scripts/seed.js (nga rrënja e chatboti-backend)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Product from '../models/Product.js';
import Faq from '../models/Faq.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

async function seed() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL mungon në .env');
    process.exit(1);
  }

  await mongoose.connect(dbUrl);
  console.log('MongoDB i lidhur.');

  const productsPath = join(dataDir, 'products.json');
  const faqPath = join(dataDir, 'faq.json');

  const productsJson = JSON.parse(readFileSync(productsPath, 'utf-8'));
  const faqJson = JSON.parse(readFileSync(faqPath, 'utf-8'));

  await Product.deleteMany({});
  await Faq.deleteMany({});

  const productDocs = productsJson.map((p) => ({
    name: p.name,
    description: p.description ?? '',
    price: p.price,
    stock: p.stock ?? 0,
    category: p.category ?? '',
    unit: p.unit ?? '',
  }));
  await Product.insertMany(productDocs);
  console.log('Produkte të shtuara:', productDocs.length);

  const faqDocs = faqJson.map((f) => ({
    type: f.type,
    keywords: f.keywords ?? [],
    answer: f.answer ?? '',
  }));
  await Faq.insertMany(faqDocs);
  console.log('FAQ të shtuara:', faqDocs.length);

  await mongoose.disconnect();
  console.log('Seed përfundoi.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
