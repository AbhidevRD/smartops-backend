import prisma from '../lib/prisma.js';
import crypto from 'crypto';

/**
 * Generates a unique 6-8 character uppercase alphanumeric join code
 * Format: A1B2C3D4 (uppercase letters and numbers)
 */
export const generateJoinCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const codeLength = 8;
  let code = '';
  
  for (let i = 0; i < codeLength; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
};

/**
 * Generates a unique join code that doesn't already exist in the database
 */
export const generateUniqueJoinCode = async () => {
  let code;
  let exists = true;
  
  // Keep generating until we find a unique code
  while (exists) {
    code = generateJoinCode();
    const existingProject = await prisma.project.findUnique({
      where: { joinCode: code },
      select: { id: true }
    });
    exists = !!existingProject;
  }
  
  return code;
};

export default generateUniqueJoinCode;
