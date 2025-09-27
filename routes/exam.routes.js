const express = require('express');
const router = express.Router();
const examController = require('../controllers/exam.controller');

// Existing routes
router.get('/', examController.getAllExams);
router.get('/:examId/questions', examController.getExamQuestions);
router.post('/', examController.createExam);
router.put('/:id', examController.updateExam);
router.delete('/:id', examController.deleteExam);
router.post('/upload-file', examController.uploadStudentFile);
router.get('/:examId/submissions/:uid', examController.getStudentSubmissions);
router.get('/:examId/students', examController.getStudentsByExamSubmissions);

// Exam report routes
router.post('/:examId/report/upload', examController.uploadExamReport);
router.get('/:examId/report/:uid', examController.getExamReport);
router.get('/:examId/reports', examController.getExamReports);
router.get('/:examId', examController.getExamById);

module.exports = router;

