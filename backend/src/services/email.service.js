import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  return transporter;
}

async function sendMail({ to, subject, html }) {
  const from = process.env.SMTP_FROM || "no-reply@example.com";
  await getTransporter().sendMail({ from, to, subject, html });
}

export async function sendRegistrationReceivedEmail(email) {
  const supportEmail = process.env.SUPPORT_EMAIL || "";
  await sendMail({
    to: email,
    subject: "Your registration has been received",
    html: `
      <p>Thanks for registering.</p>
      <p>Your account is currently <strong>pending approval</strong>.
      You'll receive another email once an administrator has reviewed your request.</p>
      ${supportEmail ? `<p>Questions? Contact us at ${supportEmail}.</p>` : ""}
    `,
  });
}

export async function sendRegistrationApprovedEmail({
  email,
  username,
  setupUrl,
}) {
  await sendMail({
    to: email,
    subject: "Your registration has been approved",
    html: `
      <p>Good news — your registration has been approved.</p>
      <p>Your username: <strong>${username}</strong></p>
      <p>Click the link below to set your password and display name.
      This link is single-use and will expire soon:</p>
      <p><a href="${setupUrl}">${setupUrl}</a></p>
    `,
  });
}

export async function sendRegistrationRejectedEmail({ email, reason }) {
  const supportEmail = process.env.SUPPORT_EMAIL || "";
  await sendMail({
    to: email,
    subject: "Your registration was not approved",
    html: `
      <p>We're sorry to let you know your registration request was not approved.</p>
      ${reason ? `<p>Reason: ${reason}</p>` : ""}
      ${supportEmail ? `<p>Questions? Contact us at ${supportEmail}.</p>` : ""}
    `,
  });
}

export async function sendPasswordResetEmail({ email, resetUrl }) {
  await sendMail({
    to: email,
    subject: "Reset your password",
    html: `
      <p>We received a request to reset your password.</p>
      <p>This link is single-use and will expire soon. If you didn't request this,
      you can safely ignore this email.</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
    `,
  });
}
