import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from '../config/database.js';
import authRoutes from '../routes/authRoutes.js';
import chatRoutes from '../routes/chatRoutes.js';
import { errorHandler } from '../middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 5000;

// CORS — lejon frontend (localhost në dev, domeni në prod)
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: corsOrigin }));

// Middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Chatboti API', docs: '/api/auth (register, login), /api/chat' });
});
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// Error handling
app.use(errorHandler);

// Start server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Serveri në http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Gabim lidhje DB:', err);
    process.exit(1);
  });
