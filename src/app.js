import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();

// ── MIDDLEWARE ──────────────────────────────────────────────
// Allow JSON data in request body
app.use(express.json());

// Allow URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// CORS: Allow requests from your frontend (Next.js)
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
}));

// ── HEALTH CHECK ROUTE ──────────────────────────────────────
// A simple route to test if the server is running
app.get('/', (req, res) => {
  res.json({
    message: 'SmartOps AI Backend is running!',
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});
// ── DATABASE TEST ROUTE (remove this after testing) ────────
import prisma from './lib/prisma.js';

app.get('/test-db', async (req, res) => {
  try {
    // Count how many users exist in the database
    const count = await prisma.user.count();
    res.json({ message: 'Database connected!', userCount: count });
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed', detail: error.message });
  }
});

// ── 404 HANDLER ─────────────────────────────────────────────
// If no route matches, send this response
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── GLOBAL ERROR HANDLER ────────────────────────────────────
// Catches any unhandled errors from routes
app.use((err, req, res, next) => {
console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
