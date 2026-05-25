import express from 'express';
import auth from '../middleware/auth.middleware.js';

import {
  parseTask,
  prioritizeTask,
  generateStandup,
  riskPredictor,
  velocityForecast,
  bottleneckDetector,
  burnoutDetector,
  sentimentAnalysis,
  startPomodoro,
  focusStats,
  awardBadges,
  leaderboard,
  dependencyGraph,
  sprintPlanner,
  notesToTasks,
  voiceCommand,
  chatWithAI,
  createTaskFromNLP,
  analyzeMeetingNotes,
  createMeetingTasks
} from '../controllers/ai.controller.js';

const router = express.Router();

// ── F12: NLP Task Creation ────────────────────────────────────────────────────
// POST /api/ai/create-task
// Accepts { message, projectId }, extracts fields via Groq, creates real DB task
router.post('/create-task', auth, createTaskFromNLP);

// NLP & Task Parsing
router.post('/parse-task', auth, parseTask);
router.post('/priority', auth, prioritizeTask);
router.post('/voice-command', auth, voiceCommand);

// AI Chat - General conversation with context awareness
router.post('/chat', auth, chatWithAI);

// Team Insights
router.get('/standup', auth, generateStandup);
router.get('/burnout', auth, burnoutDetector);
router.get('/sentiment', auth, sentimentAnalysis);
router.get('/bottleneck', auth, bottleneckDetector);

// Project Analytics
router.get('/risk/:taskId', auth, riskPredictor);
router.get('/velocity/:projectId', auth, velocityForecast);
router.get('/dependency/:projectId', auth, dependencyGraph);

// Sprint Planning
router.post('/sprint-plan', auth, sprintPlanner);
router.post('/meeting-notes/analyze', auth, analyzeMeetingNotes);
router.post('/meeting-notes/create-tasks', auth, createMeetingTasks);
router.post('/notes-to-tasks', auth, notesToTasks);

// Focus & Gamification
router.post('/pomodoro/start', auth, startPomodoro);
router.get('/pomodoro/stats', auth, focusStats);
router.post('/badges/check', auth, awardBadges);
router.get('/leaderboard', auth, leaderboard);

export default router;