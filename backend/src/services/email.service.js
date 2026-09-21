import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !user || !password) {
    throw new Error(
      "SMTP configuration is incomplete. Required: SMTP_HOST, SMTP_USER, SMTP_PASSWORD."
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass: password,
    },
  });

  return transporter;
}

// Verify SMTP connection when the backend starts.
// This does NOT send an email.
export async function verifyEmailService() {
  try {
    const transport = getTransporter();
    await transport.verify();

    console.log("[email] SMTP connection verified successfully.");
    return true;
  } catch (err) {
    console.error("[email] SMTP verification failed:", {
      message: err.message,
      code: err.code,
      command: err.command,
      response: err.response,
      responseCode: err.responseCode,
    });

    return false;
  }
}

async function sendMail({ to, subject, html }) {
  const from = process.env.SMTP_FROM;

  if (!from) {
    throw new Error("SMTP_FROM is not configured.");
  }

  console.log("[email] Sending email:", subject);

  try {
    const info = await getTransporter().sendMail({
      from,
      to,
      subject,
      html,
    });

    console.log("[email] Email sent successfully:", {
      messageId: info.messageId,
      response: info.response,
    });

    return info;
  } catch (err) {
    console.error("[email] Failed to send email:", {
      message: err.message,
      code: err.code,
      command: err.command,
      response: err.response,
      responseCode: err.responseCode,
    });

    throw err;
  }
}

export async function sendRegistrationReceivedEmail(email) {
  const supportEmail = process.env.SUPPORT_EMAIL || "";

  return sendMail({
    to: email,
    subject: "Your registration has been received",
    html: `
      <p>Thanks for registering.</p>

      <p>
        Your account is currently
        <strong>pending approval</strong>.
      </p>

      <p>
        You'll receive another email once an administrator
        has reviewed your request.
      </p>

      ${
        supportEmail
          ? `<p>Questions? Contact us at ${supportEmail}.</p>`
          : ""
      }
    `,
  });
}

export async function sendRegistrationApprovedEmail({
  email,
  username,
  setupUrl,
}) {
  return sendMail({
    to: email,
    subject: "Your registration has been approved",
    html: `
      <p>
        Good news — your registration has been approved.
      </p>

      <p>
        Your username:
        <strong>${username}</strong>
      </p>

      <p>
        Click the link below to set your password and display name.
        This link is single-use and will expire soon.
      </p>

      <p>
        <a href="${setupUrl}">
          ${setupUrl}
        </a>
      </p>
    `,
  });
}

export async function sendRegistrationRejectedEmail({
  email,
  reason,
}) {
  const supportEmail = process.env.SUPPORT_EMAIL || "";

  return sendMail({
    to: email,
    subject: "Your registration was not approved",
    html: `
      <p>
        We're sorry to let you know your registration request
        was not approved.
      </p>

      ${
        reason
          ? `<p>Reason: ${reason}</p>`
          : ""
      }

      ${
        supportEmail
          ? `<p>Questions? Contact us at ${supportEmail}.</p>`
          : ""
      }
    `,
  });
}

export async function sendPasswordResetEmail({
  email,
  resetUrl,
}) {
  return sendMail({
    to: email,
    subject: "Reset your password",
    html: `
      <p>
        We received a request to reset your password.
      </p>

      <p>
        This link is single-use and will expire soon.
        If you didn't request this, you can safely ignore this email.
      </p>

      <p>
        <a href="${resetUrl}">
          ${resetUrl}
        </a>
      </p>
    `,
  });
}