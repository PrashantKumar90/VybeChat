import { useState } from "react";
import { Link } from "react-router-dom";
import { authService } from "../services/auth.service.js";

export default function Register() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ type: null, message: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setStatus({ type: null, message: "" });
    try {
      const { data } = await authService.register(email);
      setStatus({ type: "success", message: data.message });
      setEmail("");
    } catch (err) {
      setStatus({
        type: "error",
        message: err.response?.data?.error || "Registration failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Create an account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
            placeholder="you@example.com"
          />
        </div>

        {status.message && (
          <p className={status.type === "error" ? "text-sm text-red-600" : "text-sm text-green-600"}>
            {status.message}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-slate-800 py-2 text-white font-medium hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Register"}
        </button>
      </form>

      <p className="mt-4 text-sm text-slate-500 text-center">
        Already approved?{" "}
        <Link to="/login" className="text-slate-800 underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ title, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h1 className="text-xl font-semibold text-slate-800 mb-4">{title}</h1>
        {children}
      </div>
    </div>
  );
}
