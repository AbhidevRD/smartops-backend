import prisma from '../lib/prisma.js';
import { emitToProject } from '../services/realtime.service.js';
import { requireProjectMember, sendAccessError } from '../utils/projectAccess.js';

async function attachSenders(messages) {
  const senderIds = [...new Set(messages.map(message => message.senderId))];
  const users = await prisma.user.findMany({
    where: { id: { in: senderIds } },
    select: { id: true, name: true, email: true, avatarUrl: true }
  });
  const usersById = new Map(users.map(user => [user.id, user]));

  return messages.map(message => ({
    ...message,
    sender: usersById.get(message.senderId) || null
  }));
}

export const sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { projectId, message, fileUrl, fileName, fileType } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    // Must have message text OR a file attachment
    if (!message?.trim() && !fileUrl) {
      return res.status(400).json({ error: 'Either message text or a file attachment is required' });
    }

    try {
      await requireProjectMember(projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const msg = await prisma.groupMessage.create({
      data: {
        projectId,
        senderId,
        message: message?.trim() || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileType: fileType || null,
      }
    });

    const [hydratedMessage] = await attachSenders([msg]);

    emitToProject(projectId, 'message-sent', hydratedMessage);
    emitToProject(projectId, 'new-message', hydratedMessage);

    res.json({ success: true, data: hydratedMessage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { projectId } = req.params;

    try {
      await requireProjectMember(projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const messages = await prisma.groupMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }
    });

    res.json(await attachSenders(messages));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const markRead = async (req, res) => {
  try {
    const { id } = req.params;

    const existingMessage = await prisma.groupMessage.findUnique({ where: { id } });

    if (!existingMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    try {
      await requireProjectMember(existingMessage.projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const message = await prisma.groupMessage.update({
      where: { id },
      data: { isRead: true }
    });

    res.json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
