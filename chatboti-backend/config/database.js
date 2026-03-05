/**
 * Lidhja me MongoDB me Mongoose.
 */

import mongoose from 'mongoose';

export async function connectDB() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL duhet të jetë vendosur në .env (p.sh. mongodb://localhost:27017/chatboti)');
  }
  await mongoose.connect(dbUrl);
  console.log('MongoDB i lidhur.');
}
