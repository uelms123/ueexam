const Article = require('../models/Article');
const Category = require('../models/Category');
const slugify = require('slugify');

// CREATE Article (WITH PDF SUPPORT)
// CREATE Article (WITH PDF SUPPORT)
exports.createArticle = async (req, res) => {
  try {
    const { title, summary, content, category } = req.body;
    
    let categoryDoc;
    if (category.length === 24) {
      categoryDoc = await Category.findById(category);
    } else {
      categoryDoc = await Category.findOne({ slug: category });
    }
    
    if (!categoryDoc) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const slug = slugify(title, { lower: true, strict: true });
    
    // ✅ FIXED: Use original filename from multer storage
    const pdfFilename = req.files?.pdf ? req.files.pdf[0].filename : '';
    const imageFilename = req.files?.image ? req.files.image[0].filename : '';
    
    const article = new Article({
      title,
      slug,
      summary,
      content,
      category: categoryDoc._id,
      image: imageFilename ? `/uploads/${imageFilename}` : '',
      pdf: pdfFilename ? `/uploads/${pdfFilename}` : ''
    });

    await article.save();
    await article.populate('category', 'name');
    res.status(201).json({ message: 'Article created successfully', article });
  } catch (error) {
    console.error('Create Article Error:', error);
    res.status(500).json({ error: error.message });
  }
};
// GET Articles by Category
exports.getArticlesByCategory = async (req, res) => {
  try {
    const { slug } = req.params;
    const { all } = req.query;
    
    const category = await Category.findOne({ slug });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    const filter = { category: category._id };
    if (all !== 'true') filter.isPublished = true;
    
    const articles = await Article.find(filter)
      .populate('category', 'name')
      .sort({ createdAt: -1 });
    
    res.json({ articles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET Single Article (BY SLUG - SINGLE FUNCTION)
exports.getArticle = async (req, res) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug })
      .populate('category', 'name');
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json({ article });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// UPDATE Article
// UPDATE Article - SAME FIX
exports.updateArticle = async (req, res) => {
  try {
    const { title, summary, content, category } = req.body;
    const updateData = { summary, content };

    if (title) {
      updateData.title = title;
      updateData.slug = slugify(title, { lower: true, strict: true });
    }

    if (category) {
      let categoryDoc = category.length === 24 
        ? await Category.findById(category) 
        : await Category.findOne({ slug: category });
      if (!categoryDoc) return res.status(400).json({ error: 'Invalid category' });
      updateData.category = categoryDoc._id;
    }

    // ✅ FIXED: Use original filename
    if (req.files?.image) updateData.image = `/uploads/${req.files.image[0].filename}`;
    if (req.files?.pdf) updateData.pdf = `/uploads/${req.files.pdf[0].filename}`;

    const article = await Article.findByIdAndUpdate(
      req.params.id, updateData, 
      { new: true, runValidators: true }
    ).populate('category', 'name');

    res.json({ message: 'Article updated successfully', article });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE Article
exports.deleteArticle = async (req, res) => {
  try {
    await Article.findByIdAndDelete(req.params.id);
    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// ✅ ADD THESE TWO NEW FUNCTIONS AT THE BOTTOM:
exports.toggleFeatured = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    article.isFeatured = !article.isFeatured;
    await article.save();
    
    res.json({ 
      message: `Article ${article.isFeatured ? 'added to' : 'removed from'} homepage!`,
      isFeatured: article.isFeatured 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getFeaturedArticles = async (req, res) => {
  try {
    const articles = await Article.find({ isFeatured: true })
      .populate('category', 'name')
      .sort({ createdAt: -1 }); // Removed .limit(6) to show all featured articles
    
    res.json({ articles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createArticle: exports.createArticle,
  getArticlesByCategory: exports.getArticlesByCategory,
  getArticle: exports.getArticle,
  updateArticle: exports.updateArticle,
  deleteArticle: exports.deleteArticle,
  toggleFeatured: exports.toggleFeatured, // ✅ NEW
  getFeaturedArticles: exports.getFeaturedArticles // ✅ NEW
};