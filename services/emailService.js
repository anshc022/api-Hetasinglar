const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'anshc022@gmail.com',
    pass: 'efof ysyz efyt jlvh' // App password
  }
});

// Generate OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Generate verification token
const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Send OTP email
const sendOTPEmail = async (email, otp, username) => {
  const mailOptions = {
    from: {
      name: 'Hetasinglar',
      address: 'anshc022@gmail.com'
    },
    to: email,
    subject: 'Verify Your Email - Hetasinglar',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background: linear-gradient(135deg, #f43f5e, #ec4899); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Hetasinglar</h1>
          <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Email Verification</p>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin: 0 0 20px 0;">Hello ${username}!</h2>
          
          <p style="color: #666; line-height: 1.6; margin: 0 0 25px 0;">
            Thank you for registering with Hetasinglar. To complete your registration and verify your email address, please use the OTP code below:
          </p>
          
          <div style="background: #f8f9fa; border: 2px dashed #e9ecef; padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
            <span style="font-size: 32px; font-weight: bold; color: #f43f5e; letter-spacing: 8px;">${otp}</span>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin: 20px 0;">
            This OTP will expire in <strong>10 minutes</strong>. If you didn't request this verification, please ignore this email.
          </p>
          
          <div style="background: #fff3f3; border-left: 4px solid #f43f5e; padding: 15px; margin: 20px 0;">
            <p style="color: #666; margin: 0; font-size: 14px;">
              <strong>Security Note:</strong> Never share your OTP with anyone. Hetasinglar will never ask for your password or OTP via email or phone.
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            This email was sent from Hetasinglar. If you have any questions, please contact our support team.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('OTP email sent successfully to:', email);
    return true;
  } catch (error) {
    console.error('Error sending OTP email:', error);
    return false;
  }
};

// Send welcome email after verification
const sendWelcomeEmail = async (email, username) => {
  const mailOptions = {
    from: {
      name: 'Hetasinglar',
      address: 'anshc022@gmail.com'
    },
    to: email,
    subject: 'Welcome to Hetasinglar!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background: linear-gradient(135deg, #f43f5e, #ec4899); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Hetasinglar</h1>
          <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Welcome!</p>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin: 0 0 20px 0;">Welcome ${username}!</h2>
          
          <p style="color: #666; line-height: 1.6; margin: 0 0 25px 0;">
            Congratulations! Your email has been successfully verified and your account is now active. You can now enjoy all the features of Hetasinglar.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" 
               style="background: #f43f5e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
              Start Exploring
            </a>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin: 20px 0;">
            If you have any questions or need assistance, feel free to contact our support team.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            Thank you for joining Hetasinglar. We're excited to have you on board!
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Welcome email sent successfully to:', email);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken, username) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:8000'}/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: {
      name: 'Hetasinglar',
      address: 'anshc022@gmail.com'
    },
    to: email,
    subject: 'Reset Your Password - Hetasinglar',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background: linear-gradient(135deg, #f43f5e, #ec4899); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Hetasinglar</h1>
          <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Password Reset</p>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin: 0 0 20px 0;">Hello ${username || 'User'}!</h2>
          
          <p style="color: #666; line-height: 1.6; margin: 0 0 25px 0;">
            We received a request to reset your password for your Hetasinglar account. If you didn't make this request, you can safely ignore this email.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #f43f5e; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
              Reset Your Password
            </a>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin: 20px 0;">
            This link will expire in <strong>30 minutes</strong> for your security. If the button doesn't work, you can copy and paste this link into your browser:
          </p>
          
          <div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 15px; border-radius: 8px; margin: 20px 0; word-break: break-all;">
            <span style="color: #666; font-size: 14px;">${resetUrl}</span>
          </div>
          
          <div style="background: #fff3f3; border-left: 4px solid #f43f5e; padding: 15px; margin: 20px 0;">
            <p style="color: #666; margin: 0; font-size: 14px;">
              <strong>Security Note:</strong> If you didn't request a password reset, please contact our support team immediately. Never share your reset link with anyone.
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            This email was sent from Hetasinglar. If you have any questions, please contact our support team.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent successfully to:', email);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
};

// Test email connection
const testEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log('Email service is ready to send emails');
    return true;
  } catch (error) {
    console.error('Email service configuration error:', error);
    return false;
  }
};

module.exports = {
  generateOTP,
  generateVerificationToken,
  sendOTPEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  testEmailConnection
};
