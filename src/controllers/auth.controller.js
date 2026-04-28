import prisma from '../lib/prisma.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  sendOtpEmail,
  sendResetOtpEmail
} from '../services/email.service.js';


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
        passwordHash,
        isVerified: process.env.NODE_ENV === 'development' ? true : false
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

    const response = {
      message: 'Signup successful. OTP sent.'
    };

    // In development, return OTP for testing and auto-verify
    if (process.env.NODE_ENV === 'development') {
      response.otp = otp;
      response.message = 'Dev mode: Account auto-verified. You can login directly.';
    }

    res.json(response);

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

    // In development mode, auto-verify users for easier testing
    if (!user.isVerified && process.env.NODE_ENV !== 'development') {
      return res.status(400).json({
        error: 'Verify email first'
      });
    }

    // Auto-verify in development mode
    if (!user.isVerified && process.env.NODE_ENV === 'development') {
      await prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true }
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

export const resendOtp = async (req,res)=>{
  try{

    const { email } = req.body;

    const user =
      await prisma.user.findUnique({
        where:{ email }
      });

    if(!user){
      return res.status(404).json({
        error:'User not found'
      });
    }

    const otp =
      Math.floor(
        100000 + Math.random()*900000
      ).toString();

    const tokenHash =
      await bcrypt.hash(otp,10);

    await prisma.otpToken.create({
      data:{
        userId:user.id,
        tokenHash,
        type:'EMAIL_VERIFY',
        expiresAt:
          new Date(
            Date.now()+10*60*1000
          )
      }
    });

    await sendOtpEmail(email, otp);

    const response = {
      success:true,
      message:'OTP resent'
    };

    if (process.env.NODE_ENV !== 'production') {
      response.otp = otp;
    }

    res.json(response);

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};

export const forgotPassword = async (req,res)=>{
  try{

    const { email } = req.body;

    const user =
      await prisma.user.findUnique({
        where:{ email }
      });

    if(!user){
      return res.status(404).json({
        error:'User not found'
      });
    }

    const otp =
      Math.floor(
        100000 + Math.random()*900000
      ).toString();

    const tokenHash =
      await bcrypt.hash(otp,10);

    await prisma.otpToken.create({
      data:{
        userId:user.id,
        tokenHash,
        type:'PASSWORD_RESET',
        expiresAt:
          new Date(
            Date.now()+10*60*1000
          )
      }
    });

    await sendResetOtpEmail(
      email,
      otp
    );

    const response = {
      success:true,
      message:'Reset OTP sent'
    };

    if (process.env.NODE_ENV !== 'production') {
      response.otp = otp;
    }

    res.json(response);

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};

export const resetPassword = async(req,res)=>{
  try{

    const {
      email,
      otp,
      password
    } = req.body;

    const user =
      await prisma.user.findUnique({
        where:{ email }
      });

    if(!user){
      return res.status(404).json({
        error:'User not found'
      });
    }

    const token =
      await prisma.otpToken.findFirst({
        where:{
          userId:user.id,
          type:'PASSWORD_RESET',
          used:false
        },
        orderBy:{
          createdAt:'desc'
        }
      });

    if(!token){
      return res.status(400).json({
        error:'OTP not found'
      });
    }

    const valid =
      await bcrypt.compare(
        otp,
        token.tokenHash
      );

    if(!valid){
      return res.status(400).json({
        error:'Invalid OTP'
      });
    }

    const passwordHash =
      await bcrypt.hash(password,10);

    await prisma.user.update({
      where:{ id:user.id },
      data:{ passwordHash }
    });

    await prisma.otpToken.update({
      where:{ id:token.id },
      data:{ used:true }
    });

    res.json({
      success:true,
      message:'Password updated'
    });

  }catch(error){
    res.status(500).json({
      error:error.message
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

