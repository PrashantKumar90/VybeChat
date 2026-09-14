import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  notificationService,
  enablePushNotifications,
  disablePushNotifications,
} from "../services/pushNotifications.service.js";

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState(null);
  const [pushEnabled, setPushEnabled] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );
  const [status, setStatus] = useState("");

  useEffect(() => {
    notificationService.getPreferences().then(({ data }) => setPrefs(data.preferences));
  }, []);

  async function togglePush() {
    setStatus("");
    if (pushEnabled) {
      await disablePushNotifications();
      setPushEnabled(false);
    } else {
      const result = await enablePushNotifications();
      if (result.ok) {
        setPushEnabled(true);
      } else {
        setStatus(result.reason);
      }
    }
  }

  async function updatePref(key, value) {
    const { data } = await notificationService.updatePreferences({ [key]: value });
    setPrefs(data.preferences);
  }

  if (!prefs) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Notifications</h1>
          <Link to="/" className="text-sm text-slate-500 underline">
            Back
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700">Browser push notifications</span>
          <ToggleButton checked={pushEnabled} onClick={togglePush} />
        </div>
        {status && <p className="text-xs text-red-600">{status}</p>}

        <hr className="border-slate-100" />

        <PreferenceRow
          label="Group message notifications"
          checked={prefs.groupMessageNotifications}
          onChange={(v) => updatePref("groupMessageNotifications", v)}
        />
        <PreferenceRow
          label="Show message preview"
          checked={prefs.messagePreview}
          onChange={(v) => updatePref("messagePreview", v)}
        />
        <PreferenceRow
          label="Notification sound"
          checked={prefs.notificationSound}
          onChange={(v) => updatePref("notificationSound", v)}
        />
      </div>
    </div>
  );
}

function PreferenceRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-700">{label}</span>
      <ToggleButton checked={checked} onClick={() => onChange(!checked)} />
    </div>
  );
}

function ToggleButton({ checked, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-11 h-6 rounded-full transition-colors relative ${
        checked ? "bg-slate-800" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
