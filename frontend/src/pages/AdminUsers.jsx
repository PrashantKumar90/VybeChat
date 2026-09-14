import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { adminService } from "../services/admin.service.js";
import AdminNav from "../components/AdminNav.jsx";

const STATUS_STYLES = {
  ACTIVE: "text-green-700 bg-green-50",
  PENDING: "text-amber-700 bg-amber-50",
  SUSPENDED: "text-red-700 bg-red-50",
  REJECTED: "text-slate-500 bg-slate-100",
};

export default function AdminUsers() {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (user.role !== "SUPER_ADMIN") return;
    loadRegistrations();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role]);

  function loadRegistrations() {
    adminService.listRegistrations().then(({ data }) => setRegistrations(data.registrations));
  }

  function loadUsers() {
    const params = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    adminService.listUsers(params).then(({ data }) => setUsers(data.users));
  }

  async function approve(userId) {
    setStatus("");
    try {
      await adminService.approveRegistration(userId);
      loadRegistrations();
    } catch (err) {
      setStatus(err.response?.data?.error || "Approval failed.");
    }
  }

  async function reject(userId) {
    setStatus("");
    try {
      await adminService.rejectRegistration(userId);
      loadRegistrations();
    } catch (err) {
      setStatus(err.response?.data?.error || "Rejection failed.");
    }
  }

  async function suspend(userId) {
    setStatus("");
    try {
      await adminService.suspendUser(userId);
      loadUsers();
    } catch (err) {
      setStatus(err.response?.data?.error || "Suspend failed.");
    }
  }

  async function activate(userId) {
    setStatus("");
    try {
      await adminService.activateUser(userId);
      loadUsers();
    } catch (err) {
      setStatus(err.response?.data?.error || "Activate failed.");
    }
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
        <h1 className="text-xl font-semibold text-slate-800">Users</h1>
        {status && <p className="text-sm text-red-600">{status}</p>}

        {/* --- Pending registrations --- */}
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-medium text-slate-700 mb-3">
            Pending Registrations {registrations.length > 0 && `(${registrations.length})`}
          </h2>
          {registrations.length === 0 ? (
            <p className="text-sm text-slate-400">No pending registrations.</p>
          ) : (
            <div className="space-y-2">
              {registrations.map((r) => (
                <div key={r._id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
                  <span>{r.email}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approve(r._id)}
                      className="px-3 py-1 rounded-md bg-slate-800 text-white hover:bg-slate-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => reject(r._id)}
                      className="px-3 py-1 rounded-md border border-slate-300 hover:bg-slate-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* --- All users --- */}
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex gap-2 mb-3 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadUsers()}
              placeholder="Search email, username, display name..."
              className="flex-1 min-w-[200px] rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <button
              onClick={loadUsers}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
            >
              Search
            </button>
          </div>

          <div className="space-y-2">
            {users.map((u) => (
              <div key={u._id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
                <div>
                  <p className="font-medium text-slate-700">{u.displayName || u.email}</p>
                  <p className="text-xs text-slate-400">
                    {u.email} {u.username && `· ${u.username}`} · {u.role}
                  </p>
                  <p className="text-[10px] text-slate-300 font-mono">{u._id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[u.status]}`}>
                    {u.status}
                  </span>
                  {u.status === "ACTIVE" && u.role !== "SUPER_ADMIN" && (
                    <button
                      onClick={() => suspend(u._id)}
                      className="px-2 py-1 text-xs rounded-md border border-slate-300 hover:bg-slate-50"
                    >
                      Suspend
                    </button>
                  )}
                  {u.status === "SUSPENDED" && (
                    <button
                      onClick={() => activate(u._id)}
                      className="px-2 py-1 text-xs rounded-md border border-slate-300 hover:bg-slate-50"
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
            ))}
            {users.length === 0 && <p className="text-sm text-slate-400">No users found.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
