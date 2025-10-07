require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('./firebaseAdmin');

// Import Routes
const studentRoutes = require('./routes/student.routes');
const classRoutes = require('./routes/class.routes');
const examRoutes = require('./routes/exam.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Increase server timeout for large file uploads (30 seconds)
app.set('timeout', 30000);

// Enable CORS with explicit support for multipart/form-data
const allowedOrigins = [
  'http://localhost:3000',
  'https://ueexam.vercel.app',
  'https://ueexams.com',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('❌ CORS blocked origin:', origin);
      callback(null, false); // Don't throw!
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

// Middleware for parsing JSON and URL-encoded data
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// MongoDB Connection
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }
    console.log('Attempting to connect to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB connected successfully');
    console.log('Loading Mongoose models...');
    require('./models/student.model');
    console.log('Student model loaded');
    require('./models/class.model');
    console.log('Class model loaded');
    require('./models/exam.model');
    console.log('Exam model loaded');

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed due to app termination');
      process.exit(0);
    });
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

connectDB();

// Use routes
app.use('/api/students', studentRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/exams', examRoutes);

// Route for getting user role
app.post('/api/auth/get-role', async (req, res) => {
  const { uid } = req.body;
  try {
    console.log('Fetching role for UID:', uid);
    const Student = require('./models/student.model');
    let user = await Student.findOne({ uid });
    if (user) {
      console.log('Found student:', user);
      return res.json({ role: 'student' });
    }

    console.log('User not found for UID:', uid);
    res.status(404).json({ error: 'User not found' });
  } catch (error) {
    console.error('Error fetching role:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
});

// Initialize admin user
async function initializeAdminUser() {
  const email = 'uelms2025@gmail.com';
  const password = 'admin123';
  try {
    const existingUser = await admin.auth().getUserByEmail(email).catch(err => null);
    if (existingUser) {
      console.log(`Admin user ${email} already exists with UID: ${existingUser.uid}`);
      return;
    }
    const userRecord = await admin.auth().createUser({ email, password });
    console.log('Admin user created with UID:', userRecord.uid);
  } catch (error) {
    console.error('Error initializing admin user:', error.message);
  }
}

initializeAdminUser();

// Health check route
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({ 
    status: 'OK', 
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Default route
app.get('/', (req, res) => {
  res.send('Online Exam Monitoring API Running...');
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  if (err.message.includes('Unexpected end of form')) {
    res.status(400).json({ message: 'Invalid form data: Incomplete or malformed multipart form' });
  } else {
    res.status(500).json({ message: 'Internal server error', details: err.message });
  }
});

// Start server
mongoose.connection.once('open', () => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('Models available:', Object.keys(mongoose.models));
  });
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
  if (process.env.NODE_ENV === 'production') {
    console.log('Exiting process due to MongoDB connection failure');
    process.exit(1);
  }
});