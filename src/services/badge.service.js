import prisma from '../lib/prisma.js';

export const DEFAULT_BADGES = [
  {
    name: 'Top Performer',
    description: 'Awarded for outstanding XP and consistent delivery.',
    icon: 'star'
  },
  {
    name: 'Bug Slayer',
    description: 'Awarded for resolving high-impact bug work.',
    icon: 'bug'
  },
  {
    name: 'Deadline Master',
    description: 'Awarded for completing deadline-driven work reliably.',
    icon: 'calendar-check'
  },
  {
    name: 'Team Player',
    description: 'Awarded for strong collaboration across projects.',
    icon: 'users'
  },
  {
    name: 'Sprint Champion',
    description: 'Awarded for completing significant sprint work.',
    icon: 'trophy'
  },
  {
    name: 'No Delay Hero',
    description: 'Awarded for keeping assigned work free of overdue blockers.',
    icon: 'shield-check'
  }
];

export const userBadgeInclude = {
  badge: true,
  assignedBy: {
    select: {
      id: true,
      name: true,
      email: true
    }
  }
};

export function formatUserBadge(userBadge) {
  return {
    id: userBadge.badge.id,
    assignmentId: userBadge.id,
    userId: userBadge.userId,
    badgeId: userBadge.badgeId,
    name: userBadge.badge.name,
    description: userBadge.badge.description,
    icon: userBadge.badge.icon,
    assignedById: userBadge.assignedById,
    assignedBy: userBadge.assignedBy || null,
    assignedAt: userBadge.createdAt,
    createdAt: userBadge.createdAt
  };
}

export async function seedDefaultBadges(db = prisma) {
  const results = [];

  for (const badge of DEFAULT_BADGES) {
    const result = await db.badge.upsert({
      where: { name: badge.name },
      update: {
        description: badge.description,
        icon: badge.icon
      },
      create: badge
    });

    results.push(result);
  }

  return results;
}

export async function assignBadgeToUser({
  userId,
  badgeId,
  assignedById,
  db = prisma
}) {
  return db.userBadge.create({
    data: {
      userId,
      badgeId,
      assignedById
    },
    include: userBadgeInclude
  });
}

export async function assignBadgeByName({
  userId,
  badgeName,
  assignedById,
  db = prisma
}) {
  const badge = await db.badge.findUnique({
    where: { name: badgeName },
    select: { id: true }
  });

  if (!badge) {
    return null;
  }

  try {
    const userBadge = await assignBadgeToUser({
      userId,
      badgeId: badge.id,
      assignedById,
      db
    });

    return userBadge;
  } catch (error) {
    if (error.code === 'P2002') {
      return null;
    }

    throw error;
  }
}
