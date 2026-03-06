import mongoose from 'mongoose';
import { indexProduct, removeProductFromIndex } from '../services/searchIndexService.js';

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true },
    stock: { type: Number, default: 0 },
    category: { type: String, default: '' },
    unit: { type: String, default: '' },
    // Fushat opsionale për detaje të plota te AI (kontekst)
    characteristics: { type: String, default: '' },
    details: { type: String, default: '' },
  },
  { timestamps: true }
);

productSchema.post('save', async function (doc) {
  try {
    await indexProduct(doc);
  } catch (err) {
    console.error('[SearchIndex] Failed to index product on save', {
      id: doc?._id?.toString?.(),
      error: err?.message,
    });
  }
});

productSchema.post('findOneAndUpdate', async function (doc) {
  if (!doc) return;
  try {
    await indexProduct(doc);
  } catch (err) {
    console.error('[SearchIndex] Failed to index product on update', {
      id: doc?._id?.toString?.(),
      error: err?.message,
    });
  }
});

productSchema.post('findOneAndDelete', async function (doc) {
  if (!doc) return;
  try {
    await removeProductFromIndex(doc._id);
  } catch (err) {
    console.error('[SearchIndex] Failed to remove product from index on delete', {
      id: doc?._id?.toString?.(),
      error: err?.message,
    });
  }
});

productSchema.post('deleteOne', { document: true, query: false }, async function () {
  try {
    await removeProductFromIndex(this._id);
  } catch (err) {
    console.error('[SearchIndex] Failed to remove product from index on deleteOne', {
      id: this?._id?.toString?.(),
      error: err?.message,
    });
  }
});

export default mongoose.model('Product', productSchema);
