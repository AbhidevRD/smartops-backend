import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpEmail(email, otp) {
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'SmartOps AI OTP Code',
    html: `<h2>Your OTP is ${otp}</h2>`
  });
}