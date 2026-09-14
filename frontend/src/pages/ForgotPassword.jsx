import { useState } from "react";
import { authService } from "../services/auth.service.js";
import { AuthShell } from "./Register.jsx";

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await authService.forgotPassword(identifier);
      setMessage(data.message);
    } catch {
      // Backend always returns a generic success-shaped message here,
      // but guard against network errors too.
      setMessage("If an account exists, a password reset email has been sent.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Forgot password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Email or username</label>
          <input
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
          />
        </div>

        {message && <p className="text-sm text-green-600">{message}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-slate-800 py-2 text-white font-medium hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? "Sending..." : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}
