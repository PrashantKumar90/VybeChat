import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { storageService } from "../services/storage.service.js";
import { groupService } from "../services/group.service.js";
import AdminNav from "../components/AdminNav.jsx";

const LEVEL_STYLES = {
  NORMAL: "text-green-600 bg-green-50",
  WARNING: "text-amber-600 bg-amber-50",
  CRITICAL: "text-red-600 bg-red-50",
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export default function StorageManagement() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [groups, setGroups] = useState([]);
  const [flushGroupId, setFlushGroupId] = useState("");
  const [olderThanDays, setOlderThanDays] = useState(90);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user.role !== "SUPER_ADMIN") return;
    loadOverview();
    groupService.listGroups().then(({ data }) => setGroups(data.groups));
  }, [user.role]);

  function loadOverview() {
    storageService.getOverview().then(({ data }) => setOverview(data));
  }

  async function toggleRetention() {
    const { data } = await storageService.updateRetention({
      enabled: !overview.retention.enabled,
    });
    setOverview((prev) => ({ ...prev, retention: data.retention }));
  }

  async function changeRetentionDays(days) {
    const { data } = await storageService.updateRetention({ retentionDays: days });
    setOverview((prev) => ({ ...prev, retention: data.retention }));
  }

  async function runPreview() {
    setStatus("");
    setPreview(null);
    const { data } = await storageService.previewFlush({
      groupId: flushGroupId || undefined,
      olderThanDays: Number(olderThanDays),
    });
    setPreview(data);
  }

  async function confirmFlush() {
    setBusy(true);
    setStatus("");
    try {
      const { data } = await storageService.flush({
        groupId: flushGroupId || undefined,
        olderThanDays: Number(olderThanDays),
      });
      setStatus(`Deleted ${data.deletedCount} messages (${data.imagesDeletedCount} images).`);
      setPreview(null);
      loadOverview();
    } catch (err) {
      setStatus(err.response?.data?.error || "Flush failed.");
    } finally {
      setBusy(false);
    }
  }

  if (user.role !== "SUPER_ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Super Admin access required.
      </div>
    );
  }

  if (!overview) return null;

  const { database, counts, retention } = overview;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <AdminNav />
        <h1 className="text-xl font-semibold text-slate-800">Storage Management</h1>

        {/* --- Usage overview --- */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-slate-700">Database Usage</h2>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${LEVEL_STYLES[database.level]}`}>
              {database.level} · {database.percentUsed}%
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                database.level === "CRITICAL"
                  ? "bg-red-500"
                  : database.level === "WARNING"
                  ? "bg-amber-500"
                  : "bg-green-500"
              }`}
              style={{ width: `${Math.min(database.percentUsed, 100)}%` }}
            />
          </div>
          <p className="text-sm text-slate-500">
            {formatBytes(database.usedBytes)} of {formatBytes(database.limitBytes)} used
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-sm">
            <Stat label="Users" value={counts.userCount} />
            <Stat label="Groups" value={counts.groupCount} />
            <Stat label="Messages" value={counts.messageCount} />
            <Stat label="Images" value={counts.imageMessageCount} />
          </div>
        </section>

        {/* --- Retention --- */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h2 className="font-medium text-slate-700">Automatic Retention</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">
              {retention.enabled ? "Enabled" : "Disabled"} — deletes messages older than{" "}
              {retention.retentionDays} days
            </span>
            <button
              onClick={toggleRetention}
              className={`px-3 py-1.5 text-sm rounded-md ${
                retention.enabled ? "bg-slate-800 text-white" : "border border-slate-300"
              }`}
            >
              {retention.enabled ? "Disable" : "Enable"}
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[30, 60, 90, 180].map((d) => (
              <button
                key={d}
                onClick={() => changeRetentionDays(d)}
                className={`px-3 py-1 text-sm rounded-md border ${
                  retention.retentionDays === d
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-300"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </section>

        {/* --- Manual flush --- */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h2 className="font-medium text-slate-700">Manual Message Flush</h2>
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={flushGroupId}
              onChange={(e) => setFlushGroupId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
            <span className="text-sm text-slate-500">older than</span>
            <input
              type="number"
              min="1"
              value={olderThanDays}
              onChange={(e) => setOlderThanDays(e.target.value)}
              className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <span className="text-sm text-slate-500">days</span>
            <button
              onClick={runPreview}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
            >
              Preview
            </button>
          </div>

          {preview && (
            <div className="bg-slate-50 rounded-md p-3 text-sm space-y-2">
              <p>
                This will permanently delete <strong>{preview.messageCount}</strong> messages
                (including <strong>{preview.imageCount}</strong> images) older than{" "}
                {new Date(preview.cutoff).toLocaleDateString()}. This cannot be undone.
              </p>
              <button
                onClick={confirmFlush}
                disabled={busy || preview.messageCount === 0}
                className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Deleting..." : "Confirm delete"}
              </button>
            </div>
          )}

          {status && <p className="text-sm text-slate-600">{status}</p>}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-md p-2 text-center">
      <p className="text-lg font-semibold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
