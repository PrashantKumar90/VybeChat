import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authService } from "../services/auth.service.js";
import { AuthShell } from "./Register.jsx";

export default function AccountSetup() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [tokenValid, setTokenValid] = useState(null); // null = checking
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    authService
      .checkAccountSetupToken(token)
      .then(() => setTokenValid(true))
      .catch(() => setTokenValid(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await authService.completeAccountSetup(token, password, displayName);
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.error || "Account setup failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (tokenValid === null) {
    return <AuthShell title="Account setup">Checking your setup link...</AuthShell>;
  }

  if (tokenValid === false) {
    return (
      <AuthShell title="Account setup">
        <p className="text-sm text-red-600">
          This setup link is invalid or has expired. Please contact an administrator.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Complete your account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Display name</label>
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
            placeholder="How others will see you"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-slate-800 py-2 text-white font-medium hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? "Setting up..." : "Finish setup"}
        </button>
      </form>
    </AuthShell>
  );
}
