import express from 'express';
import auth from '../middleware/auth.middleware.js';

import {
  parseTask,
  prioritizeTask,
  generateStandup,
  riskPredictor,
  velocityForecast,
  bottleneckDetector,
  burnoutRadar,
  sentimentTracker,
  startPomodoro,
  focusStats,
 awardBadges,
 leaderboard,
 dependencyGraph,
sprintPlanner,
notesToTasks,
voiceCommand
} from '../controllers/ai.controller.js';

const router = express.Router();

router.post('/parse-task', auth, parseTask);
router.post('/priority', auth, prioritizeTask);
router.get('/standup', auth, generateStandup);
router.get('/risk/:taskId', auth, riskPredictor);
router.get('/burnout', auth, burnoutRadar);

router.get(
  '/velocity/:projectId',
  auth,
  velocityForecast
);

router.get(
  '/bottleneck',
  auth,
  bottleneckDetector
);

router.get(
  '/sentiment',
  auth,
  sentimentTracker
);

router.post(
  '/pomodoro/start',
  auth,
  startPomodoro
);

router.get(
  '/pomodoro/stats',
  auth,
  focusStats
);

router.post(
  '/badges/check',
  auth,
  awardBadges
);

router.get(
  '/leaderboard',
  auth,
  leaderboard
);
export default router;

router.get(
  '/dependency/:projectId',
  auth,
  dependencyGraph
);

router.post(
  '/sprint-plan',
  auth,
  sprintPlanner
);

router.post(
  '/notes-to-tasks',
  auth,
  notesToTasks
);

router.post(
  '/voice-command',
  auth,
  voiceCommand
);