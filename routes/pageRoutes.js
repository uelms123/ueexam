// Backend: New Routes - routes/pageRoutes.js (create this file in your backend routes folder)
const express = require('express');
const router = express.Router();
const pageController = require('../controllers/pageController');

router.post('/create', pageController.createPage);
router.get('/', pageController.getAllPages);
router.get('/slug/:slug', pageController.getPageBySlug);
router.put('/:id', pageController.updatePage);
router.delete('/:id', pageController.deletePage);

module.exports = router;