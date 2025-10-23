// Backend: New Model - models/Page.js (create this file in your backend models folder)
const mongoose = require('mongoose');
const slugify = require('slugify'); // Install slugify: npm i slugify

const pageSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, unique: true },
  heading: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

pageSchema.pre('save', function(next) {
  this.slug = slugify(this.title, { lower: true, strict: true });
  next();
});

module.exports = mongoose.model('Page', pageSchema);