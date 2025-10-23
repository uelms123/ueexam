// Backend: New Controller - controllers/pageController.js (create this file in your backend controllers folder)
const Page = require('../models/Page');

exports.createPage = async (req, res) => {
  try {
    const cleanedContent = req.body.content.replace(/\n{2,}/g, '\n').trim();
    const page = new Page({ ...req.body, content: cleanedContent });
    await page.save();
    res.status(201).json({ page });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getAllPages = async (req, res) => {
  try {
    const pages = await Page.find().sort({ createdAt: -1 });
    res.json({ pages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPageBySlug = async (req, res) => {
  try {
    const page = await Page.findOne({ slug: req.params.slug });
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json({ page });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updatePage = async (req, res) => {
  try {
    const page = await Page.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json({ page });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deletePage = async (req, res) => {
  try {
    const page = await Page.findByIdAndDelete(req.params.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json({ message: 'Page deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};