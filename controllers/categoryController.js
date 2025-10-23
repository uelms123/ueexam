const Category = require('../models/Category');
const slugify = require('slugify');

// CREATE Category (ADDED SLUG CHECK)
exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const slug = slugify(name, { lower: true, strict: true });
    
    // Check for existing name OR slug
    const existingCategory = await Category.findOne({ 
      $or: [{ name }, { slug }] 
    });
    if (existingCategory) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const category = new Category({
      name,
      slug,
      description
    });

    await category.save();
    res.status(201).json({ 
      message: 'Category created successfully',
      category 
    });
  } catch (error) {
    console.error('Create Category Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET All Categories
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET Single Category
exports.getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ category });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// UPDATE Category
exports.updateCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const slug = name ? slugify(name, { lower: true, strict: true }) : undefined;

    const updateData = { name, description };
    if (slug) updateData.slug = slug;

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ 
      message: 'Category updated successfully',
      category 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE Category
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};