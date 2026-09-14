import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { adminService } from "../services/admin.service.js";
import AdminNav from "../components/AdminNav.jsx";

export default function AdminAuditLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    if (user.role === "SUPER_ADMIN") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role]);

  function load() {
    const params = {};
    if (actionFilter) params.action = actionFilter;
    adminService.listAuditLogs(params).then(({ data }) => setLogs(data.logs));
  }

  if (user.role !== "SUPER_ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Super Admin access required.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <AdminNav />
        <h1 className="text-xl font-semibold text-slate-800">Audit Logs</h1>

        <div className="flex gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">All actions</option>
            <option value="REGISTRATION_APPROVED">Registration approved</option>
            <option value="REGISTRATION_REJECTED">Registration rejected</option>
            <option value="USER_SUSPENDED">User suspended</option>
            <option value="USER_ACTIVATED">User activated</option>
            <option value="GROUP_CREATED">Group created</option>
            <option value="GROUP_EDITED">Group edited</option>
            <option value="GROUP_DELETED">Group deleted</option>
            <option value="USER_ADDED_TO_GROUP">User added to group</option>
            <option value="USER_REMOVED_FROM_GROUP">User removed from group</option>
            <option value="GROUP_ADMIN_ASSIGNED">Group Admin assigned</option>
            <option value="GROUP_ADMIN_REVERTED">Group Admin reverted</option>
            <option value="MANUAL_MESSAGE_FLUSH">Manual message flush</option>
            <option value="AUTOMATIC_CLEANUP">Automatic cleanup</option>
            <option value="RETENTION_SETTINGS_UPDATED">Retention settings updated</option>
          </select>
          <button onClick={load} className="px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50">
            Filter
          </button>
        </div>

        <section className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {logs.map((log) => (
            <div key={log._id} className="p-3 text-sm flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-700">{log.action.replaceAll("_", " ")}</p>
                <p className="text-xs text-slate-400">
                  {log.actorId ? log.actorId.displayName || log.actorId.email : "System"} ·{" "}
                  {log.targetType}
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <> · {JSON.stringify(log.metadata)}</>
                  )}
                </p>
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {new Date(log.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
          {logs.length === 0 && <p className="p-4 text-sm text-slate-400">No audit log entries yet.</p>}
        </section>
      </div>
    </div>
  );
}
