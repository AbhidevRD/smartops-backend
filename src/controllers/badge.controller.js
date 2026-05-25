import prisma from '../lib/prisma.js';
import {
  assignBadgeToUser,
  formatUserBadge,
  seedDefaultBadges,
  userBadgeInclude
} from '../services/badge.service.js';
import { createNotification } from '../services/notification.service.js';

export const getBadges = async (req, res) => {
  try {
    const badges = await prisma.badge.findMany({
      orderBy: { name: 'asc' }
    });

    res.json({
      success: true,
      data: badges,
      badges
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get badges',
      details: error.message
    });
  }
};

export const assignBadge = async (req, res) => {
  try {
    const { userId, badgeId } = req.body;

    if (!userId || !badgeId) {
      return res.status(400).json({
        success: false,
        error: 'userId and badgeId are required'
      });
    }

    const [user, badge] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true }
      }),
      prisma.badge.findUnique({
        where: { id: badgeId }
      })
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!badge) {
      return res.status(404).json({
        success: false,
        error: 'Badge not found'
      });
    }

    try {
      const userBadge = await assignBadgeToUser({
        userId,
        badgeId,
        assignedById: req.user.id
      });

      const assignedBadge = formatUserBadge(userBadge);

      // Notify the user who received the badge
      if (userId !== req.user.id) {
        await createNotification(
          userId,
          '🏅 Badge Received!',
          `You earned the "${badge.name}" badge! ${badge.description}`
        );
      }

      return res.status(201).json({
        success: true,
        message: 'Badge assigned',
        data: assignedBadge,
        badge: assignedBadge
      });
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(409).json({
          success: false,
          error: 'User already has this badge'
        });
      }

      throw error;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to assign badge',
      details: error.message
    });
  }
};

export const getUserBadges = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userBadges = await prisma.userBadge.findMany({
      where: { userId },
      include: userBadgeInclude,
      orderBy: { createdAt: 'desc' }
    });

    const badges = userBadges.map(formatUserBadge);

    res.json({
      success: true,
      user,
      data: badges,
      badges
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get user badges',
      details: error.message
    });
  }
};

export const seedBadges = async (req, res) => {
  try {
    const badges = await seedDefaultBadges();

    res.json({
      success: true,
      message: 'Default badges seeded',
      data: badges,
      badges
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to seed badges',
      details: error.message
    });
  }
};
