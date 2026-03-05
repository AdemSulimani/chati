import mongoose from 'mongoose';

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

export default mongoose.model('Product', productSchema);
