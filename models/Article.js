const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  summary: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  image: { type: String },
  pdf: { type: String },
  isPublished: { type: Boolean, default: true }, // Existing
  isFeatured: { type: Boolean, default: false } // 🔥 THIS LINE!
}, { timestamps: true });

module.exports = mongoose.model('Article', articleSchema);