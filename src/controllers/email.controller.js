import prisma from '../lib/prisma.js';

import {
  sendAdminEmail
} from '../services/email.service.js';

export const sendSingleEmail = async (req, res) => {
  try {
    const { email, subject, message } = req.body;
    const userId = req.user.id;

    const result = await sendAdminEmail(email, subject, message);

    await prisma.emailLog.create({
      data: {
        subject,
        message,
        recipient: email,
        status: result.success ? 'SENT' : 'FAILED',
        sentById: userId
      }
    });

    res.json({
      success: result.success,
      message: 'Email processed',
      id: result.id
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

export const sendBulkEmail = async (req, res) => {
  try {
    const { emails, subject, message } = req.body;
    const userId = req.user.id;

    const results = await Promise.all(
      emails.map(email =>
        sendAdminEmail(email, subject, message)
      )
    );

    await Promise.all(
      emails.map((email, idx) =>
        prisma.emailLog.create({
          data: {
            subject,
            message,
            recipient: email,
            status: results[idx].success ? 'SENT' : 'FAILED',
            sentById: userId
          }
        })
      )
    );

    res.json({
      success: true,
      message: 'Bulk emails processed',
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

export const getEmailLogs = async (req, res) => {
  try {
    const logs = await prisma.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};