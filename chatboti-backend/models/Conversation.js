import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
  },
  {
    _id: false,
    timestamps: true,
  }
);

const conversationSchema = new mongoose.Schema(
  {
    // Opsionale: lidhe me një user nëse ke autentikim
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.pre('save', function (next) {
  this.lastActivityAt = new Date();
  next();
});

export default mongoose.model('Conversation', conversationSchema);

