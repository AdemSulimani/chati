import mongoose from 'mongoose';

const faqSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    keywords: [{ type: String }],
    answer: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Faq', faqSchema);
