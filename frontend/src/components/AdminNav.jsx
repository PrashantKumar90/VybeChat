import { Link, useLocation } from "react-router-dom";

const TABS = [
  { path: "/admin/users", label: "Users" },
  { path: "/admin/groups", label: "Groups" },
  { path: "/admin/audit-logs", label: "Audit Logs" },
  { path: "/admin/storage", label: "Storage" },
];

export default function AdminNav() {
  const { pathname } = useLocation();

  return (
    <div className="flex items-center justify-between mb-6">
      <nav className="flex gap-1 bg-white rounded-lg border border-slate-200 p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.path}
            to={tab.path}
            className={`px-3 py-1.5 text-sm rounded-md ${
              pathname === tab.path ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Link to="/" className="text-sm text-slate-500 underline">
        Back to chat
      </Link>
    </div>
  );
}
