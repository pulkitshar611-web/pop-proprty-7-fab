const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fileUpload = require('express-fileupload');
const routes = require('./routes');

const app = express();

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors()); // Configure this properly for production later
app.use(express.json());
app.use(morgan('dev'));

// File Upload Middleware
// File Upload Middleware - Skip for Multer routes
app.use((req, res, next) => {
  if (req.path === '/api/tenant/insurance') {
    return next();
  }
  fileUpload({
    useTempFiles: true,
    tempFileDir: '/tmp/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
  })(req, res, next);
});

// Routes
app.use('/api', routes);
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: 'error', message: 'Something went wrong!' });
});

module.exports = app;
