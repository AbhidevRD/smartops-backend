import prisma from '../lib/prisma.js';
import { createNotification } from '../services/notification.service.js';

let isDbConnected = false;

/**
 * Verify database connection is ready
 */
async function verifyDatabaseConnection() {
  try {
    if (isDbConnected) return true;
    
    await prisma.$queryRaw`SELECT 1`;
    isDbConnected = true;
    return true;
  } catch (error) {
    console.warn('[Deadline Job] Database not ready yet, will retry...');
    return false;
  }
}

/**
 * Check for tasks with deadlines arriving today or overdue
 * Runs periodically to notify assignees about approaching/passed deadlines
 */
async function checkDeadlines() {
  try {
    // Verify DB connection before running
    if (!await verifyDatabaseConnection()) {
      throw new Error('Database connection not available');
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Find tasks with deadline today that are not done
    const dueTodayTasks = await prisma.task.findMany({
      where: {
        deadline: {
          gte: todayStart,
          lt: todayEnd
        },
        status: { not: 'DONE' },
        assigneeId: { not: null }
      },
      include: {
        project: { select: { name: true } }
      }
    });

    for (const task of dueTodayTasks) {
      // Check if we already notified today (avoid duplicates)
      const existingNotif = await prisma.notification.findFirst({
        where: {
          userId: task.assigneeId,
          title: { contains: 'Deadline Today' },
          message: { contains: task.id },
          createdAt: { gte: todayStart }
        }
      });

      if (!existingNotif) {
        await createNotification(
          task.assigneeId,
          '⏰ Deadline Today',
          `"${task.title}" in project "${task.project?.name || 'Unknown'}" is due today! [${task.id}]`
        );
      }
    }

    // Find overdue tasks (deadline passed, not done)
    const overdueTasks = await prisma.task.findMany({
      where: {
        deadline: { lt: todayStart },
        status: { not: 'DONE' },
        assigneeId: { not: null }
      },
      include: {
        project: { select: { name: true } }
      }
    });

    for (const task of overdueTasks) {
      // Only notify once per week for overdue tasks
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const existingNotif = await prisma.notification.findFirst({
        where: {
          userId: task.assigneeId,
          title: { contains: 'Overdue' },
          message: { contains: task.id },
          createdAt: { gte: oneWeekAgo }
        }
      });

      if (!existingNotif) {
        const daysOverdue = Math.floor((now - new Date(task.deadline)) / (1000 * 60 * 60 * 24));
        await createNotification(
          task.assigneeId,
          '🚨 Task Overdue',
          `"${task.title}" in "${task.project?.name || 'Unknown'}" is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue! [${task.id}]`
        );
      }
    }

    if (dueTodayTasks.length > 0 || overdueTasks.length > 0) {
      console.log(`[Deadline Check] Notified: ${dueTodayTasks.length} due today, ${overdueTasks.length} overdue`);
    }
  } catch (error) {
    console.error('[Deadline Check] Error:', error.message);
  }
}

// Run every 30 minutes
const INTERVAL_MS = 30 * 60 * 1000;
let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

// Retry function with exponential backoff
async function runDeadlineCheckWithRetry() {
  try {
    await checkDeadlines();
    retryCount = 0; // Reset on success
  } catch (error) {
    retryCount++;
    console.error(`[Deadline Check] Error (attempt ${retryCount}/${MAX_RETRIES}):`, error.message);
    
    if (retryCount < MAX_RETRIES) {
      // Retry with exponential backoff: 5s, 10s, 15s, 20s, 25s
      const delay = RETRY_DELAY_MS * retryCount;
      console.log(`[Deadline Check] Retrying in ${delay}ms...`);
      setTimeout(runDeadlineCheckWithRetry, delay);
    } else {
      console.error('[Deadline Check] Max retries exceeded, will resume on next interval');
      retryCount = 0;
    }
  }
}

// Schedule regular runs
setInterval(runDeadlineCheckWithRetry, INTERVAL_MS);

// Initial run with retry (wait 15 seconds to allow DB to fully initialize)
setTimeout(runDeadlineCheckWithRetry, 15000);

console.log('[Deadline Job] Scheduled every 30 minutes with retry logic');
