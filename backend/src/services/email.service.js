const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function getBrevoApiKey() {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured.");
  }

  return apiKey;
}

function getSender() {
  const email = process.env.BREVO_SENDER_EMAIL;
  const name = process.env.BREVO_SENDER_NAME || "VYBE";

  if (!email) {
    throw new Error("BREVO_SENDER_EMAIL is not configured.");
  }

  return {
    email,
    name,
  };
}

async function sendMail({ to, subject, html, text }) {
  const apiKey = getBrevoApiKey();

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: getSender(),
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text || undefined,
    }),
  });

  const responseText = await response.text();

  let data = {};

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { raw: responseText };
  }

  if (!response.ok) {
    console.error("[email] Brevo API failed:", {
      status: response.status,
      message: data?.message,
      code: data?.code,
    });

    throw new Error(
      data?.message || `Brevo API returned HTTP ${response.status}`
    );
  }

  console.log("[email] Brevo email sent successfully:", {
    messageId: data?.messageId,
    to,
    subject,
  });

  return data;
}

export async function sendRegistrationReceivedEmail(email) {
  const supportEmail = process.env.SUPPORT_EMAIL || "";

  return sendMail({
    to: email,
    subject: "Your VYBE registration has been received",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Registration Received</h2>

        <p>Thanks for registering with <strong>VYBE</strong>.</p>

        <p>
          Your account is currently
          <strong>pending approval</strong>.
        </p>

        <p>
          You'll receive another email once an administrator
          has reviewed your registration.
        </p>

        ${
          supportEmail
            ? `<p>Questions? Contact us at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>`
            : ""
        }

        <p>Regards,<br><strong>VYBE Team</strong></p>
      </div>
    `,
    text: `
Registration Received

Thanks for registering with VYBE.

Your account is currently pending approval.

You'll receive another email once an administrator has reviewed your registration.

${supportEmail ? `Questions? Contact us at ${supportEmail}.` : ""}

Regards,
VYBE Team
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
    subject: "Your VYBE registration has been approved",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Registration Approved</h2>

        <p>
          Good news — your registration for
          <strong>VYBE</strong> has been approved.
        </p>

        <p>
          Your username:
          <strong>${username}</strong>
        </p>

        <p>
          Click the button below to complete your account setup.
          You will create your password and display name there.
        </p>

        <p>
          <a
            href="${setupUrl}"
            style="
              display:inline-block;
              padding:12px 20px;
              background:#111827;
              color:#ffffff;
              text-decoration:none;
              border-radius:6px;
            "
          >
            Complete Account Setup
          </a>
        </p>

        <p>
          If the button doesn't work, use this link:
        </p>

        <p>
          <a href="${setupUrl}">${setupUrl}</a>
        </p>

        <p>
          This setup link is single-use and expires in 24 hours.
        </p>

        <p>Regards,<br><strong>VYBE Team</strong></p>
      </div>
    `,
    text: `
Registration Approved

Good news — your registration for VYBE has been approved.

Your username: ${username}

Complete your account setup using this link:
${setupUrl}

This setup link is single-use and expires in 24 hours.

Regards,
VYBE Team
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
    subject: "Your VYBE registration was not approved",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Registration Update</h2>

        <p>
          We're sorry to let you know that your VYBE
          registration request was not approved.
        </p>

        ${
          reason
            ? `<p><strong>Reason:</strong> ${reason}</p>`
            : ""
        }

        ${
          supportEmail
            ? `<p>Questions? Contact us at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>`
            : ""
        }

        <p>Regards,<br><strong>VYBE Team</strong></p>
      </div>
    `,
    text: `
Registration Update

We're sorry to let you know that your VYBE registration request was not approved.

${reason ? `Reason: ${reason}` : ""}

${supportEmail ? `Questions? Contact us at ${supportEmail}.` : ""}

Regards,
VYBE Team
    `,
  });
}

export async function sendPasswordResetEmail({
  email,
  resetUrl,
}) {
  return sendMail({
    to: email,
    subject: "Reset your VYBE password",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Password Reset</h2>

        <p>
          We received a request to reset your VYBE password.
        </p>

        <p>
          Click the button below to reset your password.
        </p>

        <p>
          <a
            href="${resetUrl}"
            style="
              display:inline-block;
              padding:12px 20px;
              background:#111827;
              color:#ffffff;
              text-decoration:none;
              border-radius:6px;
            "
          >
            Reset Password
          </a>
        </p>

        <p>
          If the button doesn't work, use this link:
        </p>

        <p>
          <a href="${resetUrl}">${resetUrl}</a>
        </p>

        <p>
          This link is single-use and expires in 1 hour.
        </p>

        <p>
          If you didn't request this, you can safely ignore this email.
        </p>

        <p>Regards,<br><strong>VYBE Team</strong></p>
      </div>
    `,
    text: `
Password Reset

We received a request to reset your VYBE password.

Use this link to reset your password:
${resetUrl}

This link is single-use and expires in 1 hour.

If you didn't request this, you can safely ignore this email.

Regards,
VYBE Team
    `,
  });
}