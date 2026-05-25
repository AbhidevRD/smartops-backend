import prisma from '../lib/prisma.js';

import {
  sendAdminEmail,
  sendEmail
} from '../services/email.service.js';
import { createNotification } from '../services/notification.service.js';

/**
 * Test email endpoint - sends a test email to verify SMTP configuration
 * GET /api/test-email?to=user@gmail.com
 */
export const testEmail = async (req, res) => {
  try {
    const { to } = req.query;

    if (!to) {
      return res.status(400).json({
        error: 'Missing required parameter: to (recipient email address)'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        error: 'Invalid email address format'
      });
    }

    console.log(`\n📧 Sending test email to: ${to}`);

    const result = await sendEmail(
      to,
      'SmartOps - Test Email',
      `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;padding:30px;max-width:600px;margin:0 auto">
          <div style="background-color:#28a745;color:white;padding:20px;border-radius:8px;margin-bottom:20px;text-align:center">
            <h1 style="margin:0;font-size:32px">✅ Email System Working!</h1>
          </div>
          
          <div style="background-color:#f8f9fa;padding:20px;border-radius:8px;margin-bottom:20px">
            <h2 style="color:#333;margin-top:0">Test Email Successful</h2>
            <p style="color:#666;font-size:16px;line-height:1.6">
              Congratulations! Your Gmail SMTP configuration is working correctly.
            </p>
            
            <p style="color:#666;font-size:16px;line-height:1.6">
              <strong>Configuration Details:</strong><br/>
              SMTP Server: ${process.env.SMTP_HOST || 'smtp.gmail.com'}<br/>
              SMTP Port: ${process.env.SMTP_PORT || 587}<br/>
              Email: ${process.env.SMTP_USER}
            </p>
          </div>
          
          <div style="background-color:#e7f3ff;padding:15px;border-left:4px solid #007bff;border-radius:4px">
            <p style="margin:0;color:#333;font-size:14px">
              <strong>You can now send emails through your SmartOps application:</strong><br/>
              ✓ Project invitations<br/>
              ✓ Admin notifications<br/>
              ✓ Team invites<br/>
              ✓ All email features
            </p>
          </div>
          
          <p style="color:#999;font-size:12px;margin-top:30px;border-top:1px solid #eee;padding-top:20px;text-align:center">
            <strong>SmartOps AI</strong> - Team Collaboration Platform<br/>
            © ${new Date().getFullYear()} SmartOps. All rights reserved.
          </p>
        </div>
      `
    );

    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${result.messageId}\n`);

    res.json({
      success: true,
      message: 'Test email sent successfully! Check your inbox.',
      details: {
        to,
        subject: 'SmartOps - Test Email',
        messageId: result.messageId,
        smtpServer: process.env.SMTP_HOST || 'smtp.gmail.com',
        smtpPort: process.env.SMTP_PORT || 587
      }
    });
  } catch (error) {
    console.error('❌ Test email failed:', error.message);
    res.status(500).json({
      error: `Failed to send test email: ${error.message}`,
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

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

    // Notify recipient if they exist in the system (fire-and-forget)
    prisma.user.findUnique({ where: { email }, select: { id: true } }).then(recipient => {
      if (recipient) {
        createNotification(
          recipient.id,
          '📧 Email Received',
          `You received an email: "${subject}"`
        );
      }
    }).catch(() => {});

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