import prisma from '../lib/prisma.js';
import { getSocketServer } from './realtime.service.js';

/**
 * Create a notification in DB and push it in real-time via Socket.IO
 * @param {string} userId - Target user ID
 * @param {string} title - Notification title
 * @param {string} message - Notification body
 * @returns {Promise<object>} Created notification
 */
export async function createNotification(userId, title, message) {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        isRead: false
      }
    });

    // Push real-time via Socket.IO to the user's personal room
    const io = getSocketServer();
    if (io) {
      io.to(`user:${userId}`).emit('new-notification', notification);
    }

    console.log(`[Notification] Created for user ${userId}: ${title}`);
    return notification;
  } catch (error) {
    console.error('[Notification] Failed to create:', error.message);
    return null;
  }
}

/**
 * Send notification to all members of a project
 * @param {string} projectId - Project ID
 * @param {string} title - Notification title
 * @param {string} message - Notification body
 * @param {string|null} excludeUserId - User ID to exclude (e.g., the actor)
 */
export async function notifyProjectMembers(projectId, title, message, excludeUserId = null) {
  try {
    const members = await prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true }
    });

    const userIds = members
      .map(m => m.userId)
      .filter(id => id !== excludeUserId);

    await Promise.all(
      userIds.map(userId => createNotification(userId, title, message))
    );
  } catch (error) {
    console.error('[Notification] Failed to notify project members:', error.message);
  }
}
