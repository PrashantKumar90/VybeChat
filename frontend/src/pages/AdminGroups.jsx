import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { adminService } from "../services/admin.service.js";
import { groupService } from "../services/group.service.js";
import AdminNav from "../components/AdminNav.jsx";

export default function AdminGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [members, setMembers] = useState([]);
  const [addUserId, setAddUserId] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (user.role === "SUPER_ADMIN") loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role]);

  function loadGroups() {
    groupService.listGroups().then(({ data }) => setGroups(data.groups));
  }

  async function createGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      await adminService.createGroup(newGroupName, newGroupDesc);
      setNewGroupName("");
      setNewGroupDesc("");
      loadGroups();
    } catch (err) {
      setStatus(err.response?.data?.error || "Failed to create group.");
    }
  }

  async function deleteGroup(groupId) {
    if (!window.confirm("Delete this group and all its messages? This cannot be undone.")) return;
    try {
      await adminService.deleteGroup(groupId);
      loadGroups();
      if (expandedGroupId === groupId) setExpandedGroupId(null);
    } catch (err) {
      setStatus(err.response?.data?.error || "Failed to delete group.");
    }
  }

  async function toggleExpand(groupId) {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
      return;
    }
    setExpandedGroupId(groupId);
    const { data } = await adminService.listMembers(groupId);
    setMembers(data.members);
  }

  async function addMember(groupId) {
    if (!addUserId.trim()) return;
    setStatus("");
    try {
      await adminService.addMember(groupId, addUserId.trim());
      setAddUserId("");
      const { data } = await adminService.listMembers(groupId);
      setMembers(data.members);
    } catch (err) {
      setStatus(err.response?.data?.error || "Failed to add member.");
    }
  }

  async function removeMember(groupId, userId) {
    try {
      await adminService.removeMember(groupId, userId);
      const { data } = await adminService.listMembers(groupId);
      setMembers(data.members);
    } catch (err) {
      setStatus(err.response?.data?.error || "Failed to remove member.");
    }
  }

  async function promote(groupId, userId) {
    try {
      await adminService.promoteMember(groupId, userId);
      const { data } = await adminService.listMembers(groupId);
      setMembers(data.members);
    } catch (err) {
      setStatus(err.response?.data?.error || "Failed to promote.");
    }
  }

  async function demote(groupId, userId) {
    try {
      await adminService.demoteMember(groupId, userId);
      const { data } = await adminService.listMembers(groupId);
      setMembers(data.members);
    } catch (err) {
      setStatus(err.response?.data?.error || "Failed to demote.");
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
        <h1 className="text-xl font-semibold text-slate-800">Groups</h1>
        {status && <p className="text-sm text-red-600">{status}</p>}

        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-medium text-slate-700 mb-3">Create a group</h2>
          <form onSubmit={createGroup} className="flex gap-2 flex-wrap">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name"
              className="flex-1 min-w-[160px] rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              placeholder="Description (optional)"
              className="flex-1 min-w-[160px] rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-sm rounded-md bg-slate-800 text-white hover:bg-slate-700"
            >
              Create
            </button>
          </form>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {groups.map((g) => (
            <div key={g._id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800">{g.name}</p>
                  {g.description && <p className="text-xs text-slate-400">{g.description}</p>}
                </div>
                <div className="flex gap-2 text-sm">
                  <button onClick={() => toggleExpand(g._id)} className="underline text-slate-500">
                    {expandedGroupId === g._id ? "Hide members" : "Manage members"}
                  </button>
                  <button onClick={() => deleteGroup(g._id)} className="underline text-red-600">
                    Delete
                  </button>
                </div>
              </div>

              {expandedGroupId === g._id && (
                <div className="mt-3 space-y-3 bg-slate-50 rounded-md p-3">
                  <div className="flex gap-2">
                    <input
                      value={addUserId}
                      onChange={(e) => setAddUserId(e.target.value)}
                      placeholder="User ID to add (from Users tab)"
                      className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => addMember(g._id)}
                      className="px-2 py-1 text-xs rounded-md bg-slate-800 text-white"
                    >
                      Add
                    </button>
                  </div>

                  {members.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between text-xs">
                      <span>
                        {m.displayName} {m.groupRole === "GROUP_ADMIN" && "· Group Admin"}
                      </span>
                      <div className="flex gap-2">
                        {m.groupRole === "MEMBER" ? (
                          <button onClick={() => promote(g._id, m.userId)} className="underline">
                            Make Group Admin
                          </button>
                        ) : (
                          <button onClick={() => demote(g._id, m.userId)} className="underline">
                            Revert to Member
                          </button>
                        )}
                        <button
                          onClick={() => removeMember(g._id, m.userId)}
                          className="underline text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && <p className="text-xs text-slate-400">No members yet.</p>}
                </div>
              )}
            </div>
          ))}
          {groups.length === 0 && <p className="p-4 text-sm text-slate-400">No groups yet.</p>}
        </section>
      </div>
    </div>
  );
}
