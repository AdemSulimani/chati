/**
 * Modeli User.
 * Përshtat me ORM/ODM që përdor (mongoose, prisma, sequelize).
 */

// Shembull strukturë për Mongoose:
// import mongoose from 'mongoose';
// const userSchema = new mongoose.Schema({
//   email: { type: String, required: true, unique: true },
//   password: { type: String, required: true },
//   name: String,
//   createdAt: { type: Date, default: Date.now },
// });
// export default mongoose.model('User', userSchema);

export const userSchema = {
  email: String,
  password: String,
  name: String,
  createdAt: Date,
};
