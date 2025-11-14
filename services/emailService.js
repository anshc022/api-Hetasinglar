const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Email configuration using environment variables (robust + secure defaults)
const smtpHost = process.env.SMTP_HOST || 'mailcluster.loopia.se';
const smtpPort = Number(process.env.SMTP_PORT) || 465;
// If SMTP_SECURE is provided, respect it; otherwise infer from port (465 = implicit TLS)
const smtpSecure = (typeof process.env.SMTP_SECURE === 'string')
  ? process.env.SMTP_SECURE.toLowerCase() === 'true'
  : smtpPort === 465;

const emailUser = process.env.EMAIL_USER || 'contact@hetasinglar.se';
const emailPass = process.env.EMAIL_PASS; // Do NOT fallback to any hardcoded password

// Basic config validation (no secrets logged)
if (!emailUser || !emailPass) {
  console.error('Email configuration error: EMAIL_USER or EMAIL_PASS is missing.');
}

const transporter = nodemailer.createTransporter({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure, // true for 465, false for other ports
  auth: {
    user: emailUser,
    pass: emailPass
  },
  // Connection settings for better reliability with Loopia
  connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 30000,
  greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 30000,
  socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 30000,
  // Enhanced TLS settings for Loopia mailcluster
  tls: {
    minVersion: 'TLSv1.2',
    servername: smtpHost,
    ciphers: 'HIGH:MEDIUM:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
    rejectUnauthorized: false // For Loopia compatibility
  },
  // Disable pool to avoid connection issues
  pool: false,
  // Authentication method
  authMethod: 'PLAIN',
  // Debug for troubleshooting
  debug: process.env.SMTP_DEBUG?.toLowerCase?.() === 'true' || process.env.NODE_ENV === 'development',
  logger: process.env.SMTP_DEBUG?.toLowerCase?.() === 'true' || process.env.NODE_ENV === 'development'
});

// OTP functionality deprecated: generateOTP, verification token, and sendOTPEmail removed.

// Send welcome email after verification
const sendWelcomeEmail = async (email, username) => {
  const mailOptions = {
    from: {
      name: 'Hetasinglar',
      address: process.env.EMAIL_USER || 'contact@hetasinglar.se'
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
          
          <div style="background: #f0f9ff; border: 2px solid #0ea5e9; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
            <h3 style="color: #0ea5e9; margin: 0 0 10px 0; font-size: 18px;">🎉 Welcome Bonus!</h3>
            <p style="color: #374151; margin: 0; font-size: 16px; font-weight: bold;">
              You've received <span style="color: #f43f5e;">5 free coins</span> to start chatting!
            </p>
            <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 14px;">
              Use your coins to send messages and connect with amazing people.
            </p>
          </div>
          
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
    console.error('Error sending welcome email:', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
      message: error.message
    });
    return false;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken, username) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://hetasinglar.se'}/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: {
      name: 'Hetasinglar',
      address: process.env.EMAIL_USER || 'contact@hetasinglar.se'
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
    console.error('Error sending password reset email:', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
      message: error.message
    });
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
    console.error('Email service configuration error:', {
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
      message: error.message,
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      user: emailUser
    });
    return false;
  }
};

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  testEmailConnection,
  // Added export for message notification emails
  sendMessageNotification: async (toEmail, toUsername, fromDisplayName, messageSnippet, chatLink) => {
    const safeSnippet = (messageSnippet || '').toString().slice(0, 160);
    const preview = safeSnippet.length === 160 ? `${safeSnippet}…` : safeSnippet;

    const mailOptions = {
      from: {
        name: 'Hetasinglar',
        address: process.env.EMAIL_USER || 'contact@hetasinglar.se'
      },
      to: toEmail,
      subject: `${fromDisplayName || 'New message'} sent you a message on Hetasinglar`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: linear-gradient(135deg, #f43f5e, #ec4899); padding: 24px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">New message from ${fromDisplayName || 'an escort'}</h1>
          </div>

          <div style="background: white; padding: 24px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.06);">
            <p style="color: #333; margin: 0 0 8px 0;">Hi ${toUsername || 'there'},</p>
            <p style="color: #555; line-height: 1.6; margin: 0 0 16px 0;">
              ${fromDisplayName || 'An escort'} just sent you a message on Hetasinglar.
            </p>
            ${preview ? `
              <div style="background: #f8f9fa; border-left: 4px solid #f43f5e; padding: 12px 14px; margin: 12px 0; color: #444;">
                <strong>Preview:</strong>
                <div style="margin-top: 6px; color: #444; white-space: pre-wrap;">${preview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
              </div>
            ` : ''}
            <div style="text-align: center; margin: 22px 0;">
              <a href="${chatLink || process.env.FRONTEND_URL || 'https://hetasinglar.se'}" 
                 style="background: #f43f5e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                View message
              </a>
            </div>
            <p style="color: #888; font-size: 12px; margin: 14px 0 0 0;">You receive these alerts because email updates are enabled in your profile preferences.</p>
          </div>
        </div>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log('Message notification email sent to:', toEmail);
      return true;
    } catch (error) {
      console.error('Error sending message notification email:', {
        code: error.code,
        responseCode: error.responseCode,
        command: error.command,
        message: error.message
      });
      return false;
    }
  }
};
