import nodemailer from 'nodemailer';

let smtpTransporter = null;

/**
 * Initialize SMTP transporter for Gmail SMTP
 * Uses environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */
function getSMTPTransporter() {
  if (smtpTransporter) {
    return smtpTransporter;
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ Gmail SMTP configuration missing. Set SMTP_USER and SMTP_PASS in .env');
    throw new Error('Email service not configured. Please set SMTP_USER and SMTP_PASS environment variables.');
  }

  smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // TLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return smtpTransporter;
}

/**
 * Escape HTML to prevent injection attacks
 */
function escapeHtml(value) {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Strip HTML tags for plain text version
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Main email sending function
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML email body
 * @param {string} text - Optional plain text version
 * @returns {object} Success result with messageId
 */
export async function sendEmail(to, subject, html, text = null) {
  try {
    if (!to || !subject || !html) {
      throw new Error('Missing required email fields: to, subject, html');
    }

    const transporter = getSMTPTransporter();

    const mailOptions = {
      from: process.env.SMTP_USER,
      to,
      subject,
      html,
      text: text || stripHtml(html) // Plain text fallback
    };

    const result = await transporter.sendMail(mailOptions);

    console.log(`✅ Email sent successfully`);
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Message ID: ${result.messageId}`);

    return {
      success: true,
      messageId: result.messageId,
      to,
      subject
    };
  } catch (error) {
    console.error('❌ Email sending failed:', {
      to,
      subject,
      error: error.message,
      timestamp: new Date().toISOString()
    });

    throw new Error(`Failed to send email to ${to}: ${error.message}`);
  }
}

/**
 * Send admin/notification email with formatted template
 */
export async function sendAdminEmail(email, title, message) {
  try {
    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message);

    const html = `
      <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;padding:20px;max-width:600px;margin:0 auto">
        <div style="background-color:#f8f9fa;padding:20px;border-radius:8px">
          <h2 style="color:#333;margin:0 0 15px 0">${safeTitle}</h2>
          <p style="color:#666;font-size:16px;line-height:1.6;margin:0 0 20px 0">
            ${safeMessage.replace(/\n/g, '<br/>')}
          </p>
        </div>
        
        <p style="color:#999;font-size:12px;margin-top:30px;border-top:1px solid #eee;padding-top:20px">
          <strong>SmartOps AI</strong> - Team Collaboration Platform<br/>
          © ${new Date().getFullYear()} SmartOps. All rights reserved.<br/>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}" style="color:#007bff;text-decoration:none">Visit SmartOps</a>
        </p>
      </div>
    `;

    return await sendEmail(email, title, html);
  } catch (error) {
    console.error('❌ Failed to send admin email to:', email);
    throw new Error(`Failed to send admin notification: ${error.message}`);
  }
}

/**
 * Send project invite email with formatted template
 */
export async function sendInviteEmail(
  email,
  inviteLink,
  projectName = 'SmartOps project',
  senderName = 'A SmartOps user'
) {
  try {
    const safeProjectName = escapeHtml(projectName);
    const safeSenderName = escapeHtml(senderName);
    const subject = `You're invited to ${projectName}`;

    const html = `
      <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;padding:20px;max-width:600px;margin:0 auto">
        <div style="text-align:center;margin-bottom:30px">
          <h1 style="color:#333;margin:0;font-size:28px">You're invited!</h1>
        </div>
        
        <div style="background-color:#f0f8ff;padding:20px;border-left:4px solid #007bff;border-radius:4px;margin-bottom:20px">
          <p style="color:#333;font-size:16px;margin:0;line-height:1.6">
            Hi there!<br/><br/>
            <strong>${safeSenderName}</strong> has invited you to collaborate on the project <strong>"${safeProjectName}"</strong> in SmartOps AI.
          </p>
        </div>
        
        <div style="text-align:center;margin:30px 0">
          <a href="${inviteLink}" 
             style="background-color:#007bff;color:white;padding:14px 40px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;display:inline-block">
            Accept Invitation
          </a>
        </div>
        
        <p style="color:#666;font-size:13px;margin:20px 0">
          Or copy and paste this link in your browser:
        </p>
        
        <div style="background-color:#f5f5f5;padding:12px;border-radius:4px;margin:15px 0;word-break:break-all">
          <code style="color:#333;font-size:12px;font-family:monospace">
            ${escapeHtml(inviteLink)}
          </code>
        </div>
        
        <p style="color:#999;font-size:12px;margin-top:30px;border-top:1px solid #eee;padding-top:20px">
          This invitation will expire in 7 days.<br/>
          <strong>SmartOps AI</strong> - Team Collaboration Platform<br/>
          © ${new Date().getFullYear()} SmartOps. All rights reserved.
        </p>
      </div>
    `;
    
    return await sendEmail(email, subject, html);
  } catch (error) {
    console.error('❌ Failed to send invite email to:', email);
    throw new Error(`Failed to send invite email: ${error.message}`);
  }
}

/**
 * Send OTP email for password reset
 * @param {string} email - Recipient email
 * @param {string} otp - 6-digit OTP code
 * @param {string} userName - User's name
 * @returns {object} Success result
 */
export async function sendOTPEmail(email, otp, userName = 'there') {
  try {
    const safeUserName = escapeHtml(userName);
    const subject = 'SmartOps — Password Reset Code';

    const html = `
      <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;padding:0;margin:0;background:#0a0b1a">
        <div style="max-width:600px;margin:0 auto;padding:40px 20px">
          
          <!-- Header -->
          <div style="text-align:center;margin-bottom:40px">
            <div style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#06b6d4);padding:3px;border-radius:16px">
              <div style="background:#0f0c2e;border-radius:14px;padding:16px 28px">
                <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:2px">SMARTOPS AI</span>
              </div>
            </div>
          </div>

          <!-- Card -->
          <div style="background:#0f0c2e;border:1px solid rgba(79,70,229,0.3);border-radius:20px;padding:40px;text-align:center">
            
            <div style="width:64px;height:64px;background:linear-gradient(135deg,#4f46e5,#06b6d4);border-radius:50%;margin:0 auto 24px;display:flex;align-items:center;justify-content:center">
              <span style="font-size:28px">&#128272;</span>
            </div>

            <h1 style="color:#fff;font-size:24px;font-weight:700;margin:0 0 8px">Password Reset Code</h1>
            <p style="color:#a5b4fc;font-size:15px;margin:0 0 32px">Hi ${safeUserName}, use this code to reset your password</p>

            <!-- OTP Box -->
            <div style="background:linear-gradient(135deg,rgba(79,70,229,0.2),rgba(6,182,212,0.1));border:2px solid rgba(79,70,229,0.5);border-radius:16px;padding:28px;margin:0 auto 32px;min-width:240px">
              <div style="letter-spacing:12px;font-size:40px;font-weight:800;color:#06b6d4;font-family:monospace">${otp}</div>
            </div>

            <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:14px;margin-bottom:28px">
              <p style="color:#fbbf24;font-size:13px;margin:0">This code expires in <strong>10 minutes</strong></p>
            </div>

            <p style="color:#6366f1;font-size:13px;margin:0">If you did not request this, you can safely ignore this email.</p>
          </div>

          <!-- Footer -->
          <div style="text-align:center;margin-top:30px">
            <p style="color:#374151;font-size:12px;margin:0">
              &copy; ${new Date().getFullYear()} SmartOps AI &mdash; Intelligent Project Management
            </p>
          </div>

        </div>
      </div>
    `;

    return await sendEmail(email, subject, html);
  } catch (error) {
    console.error('Failed to send OTP email to:', email);
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
}
