import { Resend } from 'resend';

const resend = new Resend(
  process.env.RESEND_API_KEY
);

export async function sendEmail(
  to,
  subject,
  html
) {
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to,
    subject,
    html
  });
}

export async function sendOtpEmail(
  email,
  otp
) {
  await sendEmail(
    email,
    'SmartOps AI OTP Code',
    `
    <h2>Email Verification</h2>
    <p>Your OTP is:</p>
    <h1>${otp}</h1>
    <p>Expires in 10 minutes.</p>
    `
  );
}

export async function sendResetOtpEmail(
  email,
  otp
) {
  await sendEmail(
    email,
    'Password Reset OTP',
    `
    <h2>Password Reset</h2>
    <p>Your OTP is:</p>
    <h1>${otp}</h1>
    <p>Expires in 10 minutes.</p>
    `
  );
}
export async function sendAdminEmail(
  email,
  title,
  message
) {
  await sendEmail(
    email,
    title,
    `
    <div style="font-family:Arial;padding:20px">
      <h2>${title}</h2>
      <p>${message}</p>
      <br/>
      <p>Regards,<br/>SmartOps Admin</p>
    </div>
    `
  );
}