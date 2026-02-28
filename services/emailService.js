import nodemailer from "nodemailer";

/**
 * Create SMTP transporter
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, // TLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Verify SMTP on startup
 */
export async function verifyEmailConnection() {
  try {
    await transporter.verify();
    console.log("✅ SMTP connected (Brevo)");
  } catch (error) {
    console.error("❌ SMTP connection failed:", error);
  }
}

/**
 * Send email
 */
export async function sendEmail({ to, subject, html, text, attachments }) {
  try {
    const mailOptions = {
      from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
      to,
      subject,
      text,
      html,
      attachments: attachments || [],
    };

    await transporter.sendMail(mailOptions);

    console.log(`📧 Email sent → ${to}`);
  } catch (error) {
    console.error("❌ Email send failed:", error);
  }
}
//just for testing