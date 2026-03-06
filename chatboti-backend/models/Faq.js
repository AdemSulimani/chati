import mongoose from 'mongoose';
import { indexFaq, removeFaqFromIndex } from '../services/searchIndexService.js';

const faqSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    keywords: [{ type: String }],
    answer: { type: String, required: true },
  },
  { timestamps: true }
);

faqSchema.post('save', async function (doc) {
  try {
    await indexFaq(doc);
  } catch (err) {
    console.error('[SearchIndex] Failed to index FAQ on save', {
      id: doc?._id?.toString?.(),
      error: err?.message,
    });
  }
});

faqSchema.post('findOneAndUpdate', async function (doc) {
  if (!doc) return;
  try {
    await indexFaq(doc);
  } catch (err) {
    console.error('[SearchIndex] Failed to index FAQ on update', {
      id: doc?._id?.toString?.(),
      error: err?.message,
    });
  }
});

faqSchema.post('findOneAndDelete', async function (doc) {
  if (!doc) return;
  try {
    await removeFaqFromIndex(doc._id);
  } catch (err) {
    console.error('[SearchIndex] Failed to remove FAQ from index on delete', {
      id: doc?._id?.toString?.(),
      error: err?.message,
    });
  }
});

faqSchema.post('deleteOne', { document: true, query: false }, async function () {
  try {
    await removeFaqFromIndex(this._id);
  } catch (err) {
    console.error('[SearchIndex] Failed to remove FAQ from index on deleteOne', {
      id: this?._id?.toString?.(),
      error: err?.message,
    });
  }
});

export default mongoose.model('Faq', faqSchema);
