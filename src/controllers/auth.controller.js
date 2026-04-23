import prisma from '../lib/prisma.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sendOtpEmail } from '../services/email.service.js';

export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      return res.status(400).json({
        error: 'User already exists'
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

    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    const tokenHash = await bcrypt.hash(otp, 10);

    await prisma.otpToken.create({
      data: {
        userId: user.id,
        tokenHash,
        type: 'EMAIL_VERIFY',
        expiresAt: new Date(
          Date.now() + 10 * 60 * 1000
        )
      }
    });

    await sendOtpEmail(email, otp);

    res.json({
      message: 'Signup successful. OTP sent.'
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const record = await prisma.otpToken.findFirst({
      where: {
        userId: user.id,
        type: 'EMAIL_VERIFY',
        used: false
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!record) {
      return res.status(400).json({
        error: 'OTP not found'
      });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({
        error: 'OTP expired'
      });
    }

    const valid = await bcrypt.compare(
      otp,
      record.tokenHash
    );

    if (!valid) {
      return res.status(400).json({
        error: 'Invalid OTP'
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true }
    });

    await prisma.otpToken.update({
      where: { id: record.id },
      data: { used: true }
    });

    res.json({
      message: 'Email verified'
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Invalid credentials'
      });
    }

    const ok = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!ok) {
      return res.status(400).json({
        error: 'Invalid credentials'
      });
    }

    if (!user.isVerified) {
      return res.status(400).json({
        error: 'Verify email first'
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

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
    res.status(500).json({
      error: error.message
    });
  }
};