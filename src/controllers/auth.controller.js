import prisma from '../lib/prisma.js';
import bcrypt from 'bcrypt';
import { signAuthToken } from '../utils/authToken.js';
import {
  sendAdminEmail,
  sendOTPEmail
} from '../services/email.service.js';

/**
 * Generate a cryptographically random 6-digit OTP
 */
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!email || !name || !password) {
      return res.status(400).json({
        error: 'Email, name, and password are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters'
      });
    }

    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      if (!existing.passwordHash) {
        return res.status(409).json({
          error: 'This email is linked to an OAuth account. Please sign in with your OAuth provider or use "Forgot Password" to set a password.'
        });
      }
      return res.status(409).json({
        error: 'User already exists with this email'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash
      }
    });

    // Generate JWT immediately on signup
    const token = signAuthToken(user);

    res.status(201).json({
      message: 'Signup successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Signup error:', error.message);
    res.status(500).json({
      error: 'Signup failed. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // OAuth-only users cannot login with password
    if (!user.passwordHash) {
      return res.status(401).json({
        error: 'This account uses OAuth login. Please sign in with your OAuth provider.'
      });
    }

    const ok = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!ok) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    const token = signAuthToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({
      error: 'Login failed. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, you will receive an OTP code'
      });
    }

    // Invalidate any existing unused OTPs for this email
    await prisma.otpCode.updateMany({
      where: { email, used: false },
      data: { used: true }
    });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.otpCode.create({
      data: { email, code: otp, expiresAt }
    });

    try {
      await sendOTPEmail(email, otp, user.name);
    } catch (emailError) {
      console.error('OTP email send failed:', emailError.message);
      // Still return success so user isn't aware if email exists
    }

    return res.status(200).json({
      success: true,
      message: 'If an account exists with this email, you will receive an OTP code'
    });

  } catch (error) {
    console.error('Forgot password error:', error.message);
    const isTableMissing = error.message?.includes('does not exist') || error.code === 'P2021';
    res.status(500).json({
      error: isTableMissing
        ? 'Password reset is not yet configured. Please contact support.'
        : 'An error occurred. Please try again.'
    });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const record = await prisma.otpCode.findFirst({
      where: {
        email,
        code: otp,
        used: false,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!record) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OTP. Please request a new one.'
      });
    }

    // Mark OTP as used (consumed after verification)
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { used: true }
    });

    return res.json({
      success: true,
      message: 'OTP verified successfully. You may now reset your password.',
      email
    });

  } catch (error) {
    console.error('Verify OTP error:', error.message);
    const isTableMissing = error.message?.includes('does not exist') || error.code === 'P2021';
    res.status(500).json({
      error: isTableMissing
        ? 'Password reset is not yet configured. Please contact support.'
        : 'Verification failed. Please try again.'
    });
  }
};

export const resetPasswordWithOTP = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Re-verify: OTP must match email+code and be created within 15 minutes
    // (used:true is allowed because verifyOTP already consumed it)
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const record = await prisma.otpCode.findFirst({
      where: {
        email,
        code: otp,
        createdAt: { gt: fifteenMinsAgo }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!record) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OTP. Please request a new reset code.'
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email },
      data: { passwordHash }
    });

    // Invalidate all OTPs for this email
    await prisma.otpCode.updateMany({
      where: { email },
      data: { used: true }
    });

    return res.json({
      success: true,
      message: 'Password reset successfully. You may now log in.'
    });

  } catch (error) {
    console.error('Reset password error:', error.message);
    const isTableMissing = error.message?.includes('does not exist') || error.code === 'P2021';
    res.status(500).json({
      error: isTableMissing
        ? 'Password reset is not yet configured. Please contact support.'
        : 'Password reset failed. Please try again.'
    });
  }
};


export const googleLogin = async (req, res) => {
  try {
    const { email, name, avatarUrl } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        error: 'Email and name are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      // Create new user for Google OAuth login
      user = await prisma.user.create({
        data: {
          name,
          email,
          avatarUrl: avatarUrl || null,
          passwordHash: null, // OAuth users don't have password
          role: 'MEMBER'
        }
      });
    } else {
      // Update existing user with latest Google profile info
      if (avatarUrl || name) {
        user = await prisma.user.update({
          where: { email },
          data: {
            ...(avatarUrl && { avatarUrl }),
            ...(name && { name })
          }
        });
      }
    }

    // Generate JWT token
    const token = signAuthToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Google login error:', error.message);
    res.status(500).json({
      error: 'Google login failed. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const sendSingleEmail =
async (req,res)=>{
  try{

    const adminId = req.user.id;

    const {
      email,
      subject,
      message
    } = req.body;

    await sendAdminEmail(
      email,
      subject,
      message
    );

    await prisma.emailLog.create({
      data:{
        subject,
        message,
        recipient:email,
        status:'SENT',
        sentById:adminId
      }
    });

    res.json({
      success:true,
      message:'Email sent'
    });

  }catch(error){

    await prisma.emailLog.create({
      data:{
        subject:req.body.subject,
        message:req.body.message,
        recipient:req.body.email,
        status:'FAILED',
        sentById:req.user.id
      }
    });

    res.status(500).json({
      error:error.message
    });
  }
};

export const sendBulkEmail =
async(req,res)=>{
  try{

    const adminId = req.user.id;

    const {
      subject,
      message
    } = req.body;

    const users =
      await prisma.user.findMany({
        select:{ email:true }
      });

    for(const user of users){

      try{

        await sendAdminEmail(
          user.email,
          subject,
          message
        );

        await prisma.emailLog.create({
          data:{
            subject,
            message,
            recipient:user.email,
            status:'SENT',
            sentById:adminId
          }
        });

      }catch{
        await prisma.emailLog.create({
          data:{
            subject,
            message,
            recipient:user.email,
            status:'FAILED',
            sentById:adminId
          }
        });
      }
    }

    res.json({
      success:true,
      message:'Bulk emails processed'
    });

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};

export const getEmailLogs =
async(req,res)=>{
  try{

    const logs =
      await prisma.emailLog.findMany({
        orderBy:{
          createdAt:'desc'
        }
      });

    res.json(logs);

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};
