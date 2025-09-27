const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staff.controller');

router.get('/', staffController.getAllStaff);
router.post('/', staffController.createStaff);
router.post('/bulk', staffController.bulkCreateStaff);
router.delete('/:email', staffController.deleteStaff);
router.get('/:uid/exams', staffController.getStaffExams);

module.exports = router;