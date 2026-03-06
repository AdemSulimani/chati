import mongoose from 'mongoose';

const searchDocumentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['product', 'faq'],
      required: true,
      index: true,
    },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
    },
    title: {
      type: String,
    },
    // Fusha të tjera opsionale për debug / analizë në të ardhmen
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('SearchDocument', searchDocumentSchema);

