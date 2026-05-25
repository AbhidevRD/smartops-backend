import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

const authUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true
};

export function signAuthToken(user) {
  return jwt.sign(
    {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export async function verifyAuthToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Invalid token');
  }

  const userId = decoded.id || decoded.userId;

  if (!userId) {
    throw new Error('Invalid token');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: authUserSelect
  });

  if (!user) {
    throw new Error('User not found. Please sign in again.');
  }

  return {
    ...decoded,
    ...user,
    userId: user.id
  };
}
