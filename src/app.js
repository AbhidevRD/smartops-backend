import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import prisma from './lib/prisma.js';

import authRoutes from './routes/auth.routes.js';
import projectRoutes from './routes/project.routes.js';
import taskRoutes from './routes/task.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import commentRoutes from './routes/comment.routes.js';
import activityRoutes from './routes/activity.routes.js';
import adminRoutes from './routes/admin.routes.js';
import reportRoutes from './routes/report.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import aiRoutes from './routes/ai.routes.js';
import emailRoutes from './routes/email.routes.js';
import chatRoutes from './routes/chat.routes.js';

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(helmet());
app.use(morgan('dev'));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
}));

app.get('/', (req, res) => {
  res.json({
    message: 'SmartOps AI Backend is running!',
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

app.get('/test-db', async (req, res) => {
  try {
    const count = await prisma.user.count();

    res.json({
      message: 'Database connected!',
      userCount: count
    });

  } catch (error) {
    res.status(500).json({
      error: 'Database connection failed',
      detail: error.message
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin-email', emailRoutes);
app.use('/api/chat', chatRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found'
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);

  res.status(500).json({
    error: 'Internal server error'
  });
});

export default app;