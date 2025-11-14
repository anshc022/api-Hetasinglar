const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('Testing email configuration locally...');
console.log('Environment variables:');
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '***SET***' : 'NOT SET');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_SECURE:', process.env.SMTP_SECURE);

// Test the transporter creation
try {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mailcluster.loopia.se',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER || 'contact@hetasinglar.se',
      pass: process.env.EMAIL_PASS || 'be3SnVqktRu9'
    },
    // Enhanced TLS settings for Loopia mailcluster
    tls: {
      minVersion: 'TLSv1.2',
      servername: process.env.SMTP_HOST || 'mailcluster.loopia.se',
      ciphers: 'HIGH:MEDIUM:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
      rejectUnauthorized: false // For Loopia compatibility
    },
    // Disable pool to avoid connection issues
    pool: false,
    // Authentication method
    authMethod: 'PLAIN',
    // Debug for troubleshooting
    debug: true,
    logger: true
  });

  console.log('\n✅ Transporter created successfully');

  // Test connection
  console.log('\n🔗 Testing SMTP connection...');
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ SMTP connection failed:', error.message);
      console.error('Full error:', error);
    } else {
      console.log('✅ SMTP connection successful!');
      
      // Test sending email
      console.log('\n📧 Sending test email...');
      const mailOptions = {
        from: process.env.EMAIL_USER || 'contact@hetasinglar.se',
        to: 'contact@hetasinglar.se', // Send to yourself for testing
        subject: 'Test Email from Hetasinglar - Local Test',
        text: 'This is a test email from the local environment to verify email functionality.',
        html: '<p>This is a <strong>test email</strong> from the local environment to verify email functionality.</p>'
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('❌ Email sending failed:', error.message);
          console.error('Full error:', error);
        } else {
          console.log('✅ Email sent successfully!');
          console.log('Message ID:', info.messageId);
          console.log('Response:', info.response);
        }
        
        // Close the transporter
        transporter.close();
      });
    }
  });

} catch (error) {
  console.error('❌ Error creating transporter:', error.message);
  console.error('Full error:', error);
}