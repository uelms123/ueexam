const express = require('express');
const router = express.Router();
const articleController = require('../controllers/articleController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

console.log('🔥 ARTICLE ROUTES LOADED!');

// Multer setup (SAME)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage, 
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'pdf' && !file.originalname.match(/\.(pdf)$/)) {
      return cb(new Error('Only PDF files allowed!'), false);
    }
    cb(null, true);
  }
});

// 🔥 FIX 1: PDF SERVING FIRST
router.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(__dirname, '../uploads', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'PDF not found' });
  }
});

// 🔥 FIX 2: FEATURED ROUTE FIRST (BEFORE :slug!)
router.get('/featured', (req, res) => {

  articleController.getFeaturedArticles(req, res);
});

// 🔥 FIX 3: TOGGLE NEXT
router.patch('/:id/toggle-featured', articleController.toggleFeatured);

// 🔥 FIX 4: SINGLE ARTICLE LAST (Catches everything else)
router.get('/:slug', articleController.getArticle);

// ALL OTHER ROUTES (SAME ORDER)
router.post('/create', upload.fields([
  { name: 'image', maxCount: 1 }, { name: 'pdf', maxCount: 1 }
]), articleController.createArticle);

router.get('/category/:slug', articleController.getArticlesByCategory);
router.put('/:id', upload.fields([
  { name: 'image', maxCount: 1 }, { name: 'pdf', maxCount: 1 }
]), articleController.updateArticle);
router.delete('/:id', articleController.deleteArticle);

module.exports = router;