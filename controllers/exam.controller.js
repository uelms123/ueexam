const Exam = require('../models/exam.model');
const Class = require('../models/class.model');
const Student = require('../models/student.model');
const Staff = require('../models/staff.model');
const Submission = require('../models/submission.model');
const ExamReport = require('../models/examReport.model');
const admin = require('../firebaseAdmin');
const multer = require('multer');
const archiver = require('archiver');
const { Readable } = require('stream');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only PDF, JPG, PNG, DOC, DOCX files are allowed'), false);
    }
    cb(null, true);
  }
}).fields([{ name: 'questionFiles[0]', maxCount: 1 }, { name: 'questionFiles[1]', maxCount: 1 }, { name: 'questionFiles[2]', maxCount: 1 }, { name: 'questionFiles[3]', maxCount: 1 }, { name: 'questionFiles[4]', maxCount: 1 }, { name: 'questionFiles[5]', maxCount: 1 }, { name: 'questionFiles[6]', maxCount: 1 }, { name: 'questionFiles[7]', maxCount: 1 }, { name: 'questionFiles[8]', maxCount: 1 }, { name: 'questionFiles[9]', maxCount: 1 }]);

// Multer for single file upload (student files)
const uploadStudentFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only PDF, JPG, PNG, DOC, DOCX files are allowed'), false);
    }
    cb(null, true);
  }
}).single('file');

// Multer for report file upload
const uploadReportFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for reports
}).single('reportFile');

// Initialize Firebase Storage bucket
const bucket = admin.storage().bucket();

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err.message);
    return res.status(400).json({ error: `Multer error: ${err.message}` });
  }
  if (err.message.includes('Only PDF, JPG, PNG, DOC, DOCX files are allowed') || err.message.includes('Only PDF files are allowed')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
};

// Create a new exam
exports.createExam = [upload, handleMulterError, async (req, res) => {
  const { title, class: classId, description, startDate, endDate, duration, uploadDuration, questions } = req.body;

  try {
    let parsedQuestions = [];
    try {
      parsedQuestions = JSON.parse(questions);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid questions format' });
    }

    // Validate questions
    if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
      return res.status(400).json({ error: 'At least one question is required' });
    }

    parsedQuestions.forEach(q => {
      if (!q.description) {
        throw new Error('All questions must have a description');
      }
      if (q.type === 'mcq' && (!q.options || q.options.length < 2)) {
        throw new Error('MCQ questions must have at least 2 options');
      }
      if (q.type === 'file' && !q.fileTypesAllowed) {
        q.fileTypesAllowed = {
          pdf: true,
          doc: false,
          docx: false,
          jpg: true,
          png: true
        };
      }
    });

    // Handle file uploads only for file-type questions
    const files = req.files;
    if (files) {
      const uploadPromises = Object.entries(files).map(([fieldName, fileArray]) => {
        const file = fileArray[0];
        const match = fieldName.match(/questionFiles\[(\d+)\]/);
        if (!match) return;
        const index = match[1];
        if (!parsedQuestions[index] || parsedQuestions[index].type !== 'file') return;
        return new Promise((resolve, reject) => {
          const filename = `exam-questions/${Date.now()}-${file.originalname}`;
          const blob = bucket.file(filename);
          const blobStream = blob.createWriteStream({
            metadata: { contentType: file.mimetype }
          });
          blobStream.on('error', reject);
          blobStream.on('finish', async () => {
            await blob.makePublic();
            const url = `https://storage.googleapis.com/${bucket.name}/${filename}`;
            resolve({ index: parseInt(index), url, fileType: file.mimetype });
          });
          blobStream.end(file.buffer);
        });
      }).filter(Boolean);

      const uploadedFiles = await Promise.all(uploadPromises);
      uploadedFiles.forEach(({ index, url, fileType }) => {
        if (parsedQuestions[index]) {
          parsedQuestions[index].fileUrl = url;
          parsedQuestions[index].fileType = fileType;
        }
      });
    }

    // Create exam
    const exam = new Exam({
      title,
      class: classId,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      duration: parseInt(duration),
      uploadDuration: parseInt(uploadDuration),
      questions: parsedQuestions
    });
    await exam.save();
    console.log('Exam saved to MongoDB:', exam._id);

    // Add to class
    const classDoc = await Class.findById(classId);
    if (classDoc) {
      classDoc.exams.push(exam._id);
      await classDoc.save();
      console.log('Exam added to class:', classId);

      // Add to students
      if (classDoc.students && classDoc.students.length > 0) {
        const students = await Student.find({ _id: { $in: classDoc.students } });
        for (const student of students) {
          student.exams.push(exam._id);
          await student.save();
          console.log('Exam added to student:', student.uid);
        }
      }
    }

    // Add to all staff
    const staffs = await Staff.find({});
    for (const staff of staffs) {
      staff.exams.push(exam._id);
      await staff.save();
      console.log('Exam added to staff:', staff.uid);
    }

    res.status(201).json(exam);
  } catch (error) {
    console.error('Error creating exam:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message).join(', ');
      return res.status(400).json({ error: messages });
    }
    res.status(400).json({ error: error.message });
  }
}];

// Update an exam
exports.updateExam = [upload, handleMulterError, async (req, res) => {
  const { id } = req.params;
  const { title, class: classId, description, startDate, endDate, duration, uploadDuration, questions } = req.body;

  try {
    const oldExam = await Exam.findById(id).populate('class');
    if (!oldExam) {
      console.log('Exam not found for ID:', id);
      return res.status(404).json({ error: 'Exam not found' });
    }

    let parsedQuestions = [];
    try {
      parsedQuestions = JSON.parse(questions);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid questions format' });
    }

    parsedQuestions.forEach(q => {
      if (!q.description) {
        throw new Error('All questions must have a description');
      }
      if (q.type === 'mcq' && (!q.options || q.options.length < 2)) {
        throw new Error('MCQ questions must have at least 2 options');
      }
      if (q.type === 'file' && !q.fileTypesAllowed) {
        q.fileTypesAllowed = {
          pdf: true,
          doc: false,
          docx: false,
          jpg: true,
          png: true
        };
      }
    });

    // Handle file uploads only for file-type questions
    const files = req.files;
    if (files) {
      const uploadPromises = Object.entries(files).map(([fieldName, fileArray]) => {
        const file = fileArray[0];
        const match = fieldName.match(/questionFiles\[(\d+)\]/);
        if (!match) return;
        const index = match[1];
        if (!parsedQuestions[index] || parsedQuestions[index].type !== 'file') return;
        return new Promise((resolve, reject) => {
          const filename = `exam-questions/${Date.now()}-${file.originalname}`;
          const blob = bucket.file(filename);
          const blobStream = blob.createWriteStream({
            metadata: { contentType: file.mimetype }
          });
          blobStream.on('error', reject);
          blobStream.on('finish', async () => {
            await blob.makePublic();
            const url = `https://storage.googleapis.com/${bucket.name}/${filename}`;
            console.log('File uploaded to Firebase:', url);
            resolve({ index: parseInt(index), url, fileType: file.mimetype });
          });
          blobStream.end(file.buffer);
        });
      }).filter(Boolean);

      const uploadedFiles = await Promise.all(uploadPromises);
      uploadedFiles.forEach(({ index, url, fileType }) => {
        if (parsedQuestions[index]) {
          parsedQuestions[index].fileUrl = url;
          parsedQuestions[index].fileType = fileType;
        }
      });
    }

    const oldFileUrls = oldExam.questions
      .filter(q => q.type === 'file' && q.fileUrl)
      .map(q => q.fileUrl);
    const newFileUrls = parsedQuestions
      .filter(q => q.type === 'file' && q.fileUrl)
      .map(q => q.fileUrl);
    const deletedFileUrls = oldFileUrls.filter(url => !newFileUrls.includes(url));

    if (deletedFileUrls.length > 0) {
      try {
        const deletePromises = deletedFileUrls.map(async (url) => {
          const filePath = url.split(`${bucket.name}/`)[1];
          if (filePath) {
            console.log(`Deleting file from Firebase: ${filePath}`);
            await bucket.file(filePath).delete();
          }
        });
        await Promise.all(deletePromises);
      } catch (err) {
        console.warn(`Failed to delete some files for exam ${id}:`, err.message);
      }
    }

    const updatedExam = await Exam.findByIdAndUpdate(
      id,
      {
        title,
        class: classId,
        description,
        startDate,
        endDate,
        duration: parseInt(duration),
        uploadDuration: parseInt(uploadDuration),
        questions: parsedQuestions
      },
      { new: true }
    ).populate('class', 'name');

    if (!updatedExam) {
      console.log('Exam not found for ID:', id);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const oldClassId = oldExam.class?._id.toString();
    const newClassId = classId;
    if (oldClassId && newClassId && oldClassId !== newClassId) {
      const oldClassDoc = await Class.findById(oldClassId);
      if (oldClassDoc) {
        oldClassDoc.exams.pull(id);
        await oldClassDoc.save();
        console.log('Exam removed from old class:', oldClassId);
        const oldStudents = await Student.find({ _id: { $in: oldClassDoc.students } });
        for (const student of oldStudents) {
          student.exams.pull(id);
          await student.save();
          console.log('Exam removed from old student:', student.uid);
        }
      }
      const newClassDoc = await Class.findById(newClassId);
      if (newClassDoc) {
        if (!newClassDoc.exams.includes(id)) {
          newClassDoc.exams.push(id);
          await newClassDoc.save();
          console.log('Exam added to new class:', newClassId);
        }
        if (newClassDoc.students && newClassDoc.students.length > 0) {
          const newStudents = await Student.find({ _id: { $in: newClassDoc.students } });
          for (const student of newStudents) {
            if (!student.exams.includes(id)) {
              student.exams.push(id);
              await student.save();
              console.log('Exam added to new student:', student.uid);
            }
          }
        }
      }
    } else if (newClassId) {
      const currentClassDoc = await Class.findById(newClassId);
      if (currentClassDoc && currentClassDoc.students && currentClassDoc.students.length > 0) {
        const currentStudents = await Student.find({ _id: { $in: currentClassDoc.students } });
        for (const student of currentStudents) {
          if (!student.exams.includes(id)) {
            student.exams.push(id);
            await student.save();
            console.log('Exam added to existing student:', student.uid);
          }
        }
      }
    }

    // Ensure all staff have this exam
    const staffs = await Staff.find({});
    for (const staff of staffs) {
      if (!staff.exams.includes(id)) {
        staff.exams.push(id);
        await staff.save();
        console.log('Exam added to staff:', staff.uid);
      }
    }

    console.log('Exam updated in MongoDB:', updatedExam._id);
    res.json(updatedExam);
  } catch (error) {
    console.error('Error updating exam:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message).join(', ');
      return res.status(400).json({ error: messages });
    }
    res.status(400).json({ error: error.message });
  }
}];

// Delete an exam
exports.deleteExam = async (req, res) => {
  const { id } = req.params;

  try {
    const examDoc = await Exam.findById(id).populate('class');
    if (!examDoc) {
      console.log('Exam not found for ID:', id);
      return res.status(404).json({ error: 'Exam not found' });
    }

    await Exam.findByIdAndDelete(id);
    console.log('Exam deleted from MongoDB:', id);

    // Remove from class
    if (examDoc.class) {
      const classDoc = await Class.findById(examDoc.class._id);
      if (classDoc) {
        classDoc.exams.pull(id);
        await classDoc.save();
        console.log('Exam removed from class:', examDoc.class._id);
      }
      if (classDoc.students && classDoc.students.length > 0) {
        const students = await Student.find({ _id: { $in: classDoc.students } });
        for (const student of students) {
          student.exams.pull(id);
          await student.save();
          console.log('Exam removed from student:', student.uid);
        }
      }
    }

    // Remove from all staff
    const staffs = await Staff.find({});
    for (const staff of staffs) {
      staff.exams.pull(id);
      await staff.save();
      console.log('Exam removed from staff:', staff.uid);
    }

    console.log('Exam deleted from MongoDB:', id);
    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    console.error('Error deleting exam:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Upload exam report PDF
exports.uploadExamReport = [
  uploadReportFile,
  handleMulterError,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const { examId, uid, violations, totalViolations, examStartTime, examEndTime, wordCounts, userAnswers } = req.body;

    try {
      const student = await Student.findOne({ uid });
      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const exam = await Exam.findById(examId);
      if (!exam) {
        return res.status(404).json({ error: 'Exam not found' });
      }

      // Check if exam report already exists
      const existingReport = await ExamReport.findOne({ examId, uid });
      if (existingReport && existingReport.completed) {
        return res.status(403).json({ error: 'Exam already completed' });
      }

      const filename = `exam-reports/${examId}/${uid}/${Date.now()}-exam-report.pdf`;
      const blob = bucket.file(filename);
      const blobStream = blob.createWriteStream({
        metadata: { contentType: req.file.mimetype }
      });

      blobStream.on('error', (err) => {
        console.error('Upload stream error:', err);
        res.status(500).json({ error: 'Failed to upload report' });
      });

      blobStream.on('finish', async () => {
        await blob.makePublic();
        const reportUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
        console.log('Exam report uploaded to Firebase:', reportUrl);

        // Save or update the report
        const report = existingReport || new ExamReport({
          examId,
          uid,
          studentId: student._id,
          reportUrl,
          violations: JSON.parse(violations || '{}'),
          totalViolations: parseInt(totalViolations || 0),
          examStartTime: new Date(examStartTime),
          examEndTime: new Date(examEndTime),
          wordCounts: JSON.parse(wordCounts || '{}'),
          userAnswers: JSON.parse(userAnswers || '{}'),
          completed: true,
        });

        if (existingReport) {
          existingReport.reportUrl = reportUrl;
          existingReport.violations = JSON.parse(violations || '{}');
          existingReport.totalViolations = parseInt(totalViolations || 0);
          existingReport.examStartTime = new Date(examStartTime);
          existingReport.examEndTime = new Date(examEndTime);
          existingReport.wordCounts = JSON.parse(wordCounts || '{}');
          existingReport.userAnswers = JSON.parse(userAnswers || '{}');
          existingReport.completed = true;
          await existingReport.save();
          console.log('Exam report updated in MongoDB:', existingReport._id);
        } else {
          await report.save();
          console.log('Exam report saved to MongoDB:', report._id);
        }

        res.json({ reportUrl, message: 'Report uploaded successfully' });
      });

      blobStream.end(req.file.buffer);
    } catch (error) {
      console.error('Error uploading exam report:', error);
      res.status(500).json({ error: 'Failed to upload report' });
    }
  }
];

// Get exam report for a student
exports.getExamReport = async (req, res) => {
  const { examId, uid } = req.params;
  try {
    console.log(`Fetching exam report for exam ID: ${examId}, UID: ${uid}`);
    const report = await ExamReport.findOne({ examId, uid })
      .populate('examId', 'title startDate')
      .populate('studentId', 'name email');
    if (!report) {
      console.log(`No report found for exam ID: ${examId}, UID: ${uid}`);
      return res.status(404).json({ error: 'No report found' });
    }
    console.log('Exam report fetched:', report._id);
    res.json(report);
  } catch (error) {
    console.error(`Error fetching exam report:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Get all reports for an exam (for admin overview)
exports.getExamReports = async (req, res) => {
  const { examId } = req.params;
  try {
    console.log(`Fetching all reports for exam ID: ${examId}`);
    const reports = await ExamReport.find({ examId })
      .populate('studentId', 'name email uid')
      .sort({ generatedAt: -1 });
    res.json(reports);
  } catch (error) {
    console.error(`Error fetching exam reports:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Get exam details by ID
exports.getExamById = async (req, res) => {
  const { examId } = req.params;
  const { uid } = req.query;
  try {
    console.log(`Fetching exam details for exam ID: ${examId}, UID: ${uid}`);
    const exam = await Exam.findById(examId).populate('class', 'name');
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const currentTime = new Date();
    const endTime = new Date(exam.endDate);
    const isExamOver = currentTime > endTime;

    let report = null;
    let completed = false;
    let attended = false;

    if (uid) {
      report = await ExamReport.findOne({ examId, uid });
      completed = report ? report.completed : false;
      attended = !!report; // If a report exists, the student attended
    }

    console.log(`Exam details fetched for exam ID: ${examId}`);
    res.json({
      ...exam.toObject(),
      isExamOver,
      completed,
      attended,
    });
  } catch (error) {
    console.error(`Error fetching exam details for exam ID: ${examId}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Get all exams
exports.getAllExams = async (req, res) => {
  try {
    console.log('Fetching all exams...', req.query);
    if (req.query.uid) {
      console.log('Fetching exams for student UID:', req.query.uid);
      const student = await Student.findOne({ uid: req.query.uid })
        .populate({
          path: 'exams',
          populate: { path: 'class', select: 'name' }
        });
      if (!student) {
        console.log('Student not found for UID:', req.query.uid);
        return res.status(404).json({ error: 'Student not found' });
      }

      const currentTime = new Date();
      const examsWithStatus = await Promise.all(
        student.exams.map(async (exam) => {
          const report = await ExamReport.findOne({ examId: exam._id, uid: req.query.uid });
          const endTime = new Date(exam.endDate);
          return {
            ...exam.toObject(),
            completed: report ? report.completed : false,
            attended: !!report,
            isExamOver: currentTime > endTime,
          };
        })
      );

      console.log('Student exams fetched:', examsWithStatus.length);
      res.json(examsWithStatus);
    } else {
      const exams = await Exam.find({})
        .populate('class', 'name');
      console.log('Exams fetched:', exams.length);
      res.json(exams);
    }
  } catch (error) {
    console.error('Error fetching exams:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Get exam questions
exports.getExamQuestions = async (req, res) => {
  const { examId } = req.params;
  const { uid } = req.query;
  try {
    console.log(`Fetching questions for exam ID: ${examId}, UID: ${uid}`);
    const exam = await Exam.findById(examId).select('questions');
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }
    res.json(exam.questions);
  } catch (error) {
    console.error(`Error fetching questions for exam ID: ${examId}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Upload student file
exports.uploadStudentFile = [
  uploadStudentFile,
  handleMulterError,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { examId, questionId, uid } = req.body;

    try {
      const student = await Student.findOne({ uid });
      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const exam = await Exam.findById(examId);
      if (!exam) {
        return res.status(404).json({ error: 'Exam not found' });
      }

      const filename = `student-submissions/${uid}/${examId}/${questionId}/${Date.now()}-${req.file.originalname}`;
      const blob = bucket.file(filename);
      const blobStream = blob.createWriteStream({
        metadata: { contentType: req.file.mimetype }
      });

      blobStream.on('error', (err) => {
        console.error('Upload stream error:', err);
        res.status(500).json({ error: 'Failed to upload file' });
      });

      blobStream.on('finish', async () => {
        await blob.makePublic();
        const fileUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
        console.log('Student file uploaded to Firebase:', fileUrl);

        const submission = new Submission({
          examId,
          questionId,
          uid,
          studentId: student._id,
          fileUrl
        });
        await submission.save();
        console.log('Submission saved to MongoDB:', submission._id);

        res.json({ fileUrl });
      });

      blobStream.end(req.file.buffer);
    } catch (error) {
      console.error('Error uploading student file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }
];

// Get student submissions
exports.getStudentSubmissions = async (req, res) => {
  const { examId, uid } = req.params;
  try {
    console.log(`Fetching submissions for exam ID: ${examId}, UID: ${uid}`);
    const exam = await Exam.findById(examId);
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const student = await Student.findOne({ uid });
    if (!student) {
      console.log(`Student not found for UID: ${uid}`);
      return res.status(404).json({ error: 'Student not found' });
    }

    const submissions = await Submission.find({ examId, uid })
      .populate('studentId', 'name uid email')
      .lean();

    if (!submissions || submissions.length === 0) {
      console.log(`No submissions found for exam ID: ${examId}, UID: ${uid}`);
      return res.json([]); // Return empty array instead of 404 to match frontend expectation
    }

    console.log(`Found ${submissions.length} submissions for exam ID: ${examId}, UID: ${uid}`);
    res.json(submissions);
  } catch (error) {
    console.error(`Error fetching submissions for exam ID: ${examId}, UID: ${uid}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Get students by exam submissions
exports.getStudentsByExamSubmissions = async (req, res) => {
  const { examId } = req.params;
  try {
    console.log(`Fetching students for exam ID: ${examId}`);
    const exam = await Exam.findById(examId).populate('class', 'students');
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const classId = exam.class?._id;
    if (!classId) {
      console.log(`No class associated with exam ID: ${examId}`);
      return res.status(404).json({ error: 'No class associated with this exam' });
    }

    const students = await Student.find({ _id: { $in: exam.class.students } })
      .select('email uid')
      .lean();

    const submissions = await Submission.find({ examId })
      .select('studentId')
      .lean();

    const studentsWithSubmissions = new Set(
      submissions.map((submission) => submission.studentId.toString())
    );

    const studentsWithAttendance = students.map((student) => ({
      _id: student._id,
      email: student.email,
      uid: student.uid,
      attended: studentsWithSubmissions.has(student._id.toString()),
    }));

    console.log(`Found ${studentsWithAttendance.length} students for exam ID: ${examId}`);
    res.json(studentsWithAttendance);
  } catch (error) {
    console.error(`Error fetching students for exam ID: ${examId}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Download all submissions as a ZIP file
exports.downloadAllSubmissions = async (req, res) => {
  const { examId } = req.params;
  try {
    console.log(`Fetching all submissions for exam ID: ${examId}`);
    const exam = await Exam.findById(examId).select('title');
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const submissions = await Submission.find({ examId })
      .populate('studentId', 'name email uid')
      .lean();

    if (!submissions || submissions.length === 0) {
      console.log(`No submissions found for exam ID: ${examId}`);
      return res.status(404).json({ error: 'No submissions found for this exam' });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const sanitizedExamTitle = exam.title.replace(/[^a-zA-Z0-9-_]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${sanitizedExamTitle}_submissions.zip`);

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to create ZIP file' });
    });

    archive.pipe(res);

    for (const submission of submissions) {
      const fileUrl = submission.fileUrl;
      if (!fileUrl) continue;

      try {
        const filePath = fileUrl.split(`${bucket.name}/`)[1];
        if (!filePath) {
          console.warn(`Invalid file URL for submission: ${fileUrl}`);
          continue;
        }

        const file = bucket.file(filePath);
        const [metadata] = await file.getMetadata();
        const fileName = `${submission.studentId.name || submission.studentId.uid}_Q${submission.questionId}_${filePath.split('/').pop()}`;
        
        const [fileBuffer] = await file.download();
        archive.append(Readable.from(fileBuffer), { name: fileName });
        console.log(`Added file to ZIP: ${fileName}`);
      } catch (err) {
        console.warn(`Failed to download file ${fileUrl}: ${err.message}`);
      }
    }

    await archive.finalize();
    console.log(`ZIP file created for exam ID: ${examId}`);
  } catch (error) {
    console.error(`Error downloading submissions for exam ID: ${examId}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Download all reports as a ZIP file
exports.downloadAllReports = async (req, res) => {
  const { examId } = req.params;
  try {
    console.log(`Fetching all reports for exam ID: ${examId}`);
    const exam = await Exam.findById(examId).select('title');
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const reports = await ExamReport.find({ examId })
      .populate('studentId', 'name email uid')
      .lean();

    if (!reports || reports.length === 0) {
      console.log(`No reports found for exam ID: ${examId}`);
      return res.status(404).json({ error: 'No reports found for this exam' });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const sanitizedExamTitle = exam.title.replace(/[^a-zA-Z0-9-_]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${sanitizedExamTitle}_reports.zip`);

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to create ZIP file' });
    });

    archive.pipe(res);

    for (const report of reports) {
      const fileUrl = report.reportUrl;
      if (!fileUrl) continue;

      try {
        const filePath = fileUrl.split(`${bucket.name}/`)[1];
        if (!filePath) {
          console.warn(`Invalid file URL for report: ${fileUrl}`);
          continue;
        }

        const file = bucket.file(filePath);
        const [metadata] = await file.getMetadata();
        const fileName = `${report.studentId.name || report.studentId.uid}_ExamReport_${filePath.split('/').pop()}`;
        
        const [fileBuffer] = await file.download();
        archive.append(Readable.from(fileBuffer), { name: fileName });
        console.log(`Added report to ZIP: ${fileName}`);
      } catch (err) {
        console.warn(`Failed to download report ${fileUrl}: ${err.message}`);
      }
    }

    await archive.finalize();
    console.log(`ZIP file created for exam ID: ${examId}`);
  } catch (error) {
    console.error(`Error downloading reports for exam ID: ${examId}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

exports.upload = upload;