"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface User {
  id: string;
  email: string | null;
  name: string | null;
  githubId: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  lastIp: string | null;
  createdAt: string;
  _count: { projects: number };
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function fetchUsers() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (roleFilter) params.set("role", roleFilter);
    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json();
    setUsers(data.users || []);
    setTotal(data.total || 0);
    setLoading(false);
  }

  useEffect(() => {
    fetchUsers();
  }, [page, search, statusFilter, roleFilter]);

  async function updateUser(userId: string, updates: Partial<{ role: string; status: string }>) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...updates }),
    });
    if (res.ok) {
      setMessage("User updated");
      fetchUsers();
      setTimeout(() => setMessage(""), 2000);
    } else {
      setMessage("Update failed");
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Users</h2>
        <div className="text-sm text-gray-400">{total} total</div>
      </div>

      {message && <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-2 rounded">{message}</div>}

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search email, name, githubId..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white w-64"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white">
          <option value="">All roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-800 text-gray-300 uppercase text-xs">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">GitHub</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Projects</th>
              <th className="px-4 py-3">Last Login</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-800 hover:bg-gray-800/50">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{u.name || "—"}</div>
                  <div className="text-gray-400 text-xs">{u.email}</div>
                </td>
                <td className="px-4 py-3 text-gray-300">{u.githubId || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${u.role === "admin" ? "bg-purple-500/20 text-purple-400" : "bg-gray-700 text-gray-300"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    u.status === "active" ? "bg-green-500/20 text-green-400" :
                    u.status === "suspended" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-red-500/20 text-red-400"
                  }`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-300">{u._count.projects}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}
                  {u.lastIp && <div className="text-gray-500">{u.lastIp}</div>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/users/${u.id}`} className="text-blue-400 hover:text-blue-300 text-xs">View</Link>
                    <button onClick={() => updateUser(u.id, { role: u.role === "admin" ? "user" : "admin" })} className="text-purple-400 hover:text-purple-300 text-xs">
                      {u.role === "admin" ? "Demote" : "Promote"}
                    </button>
                    {u.status !== "suspended" && (
                      <button onClick={() => updateUser(u.id, { status: "suspended" })} className="text-yellow-400 hover:text-yellow-300 text-xs">Suspend</button>
                    )}
                    {u.status !== "banned" && (
                      <button onClick={() => updateUser(u.id, { status: "banned" })} className="text-red-400 hover:text-red-300 text-xs">Ban</button>
                    )}
                    {(u.status === "suspended" || u.status === "banned") && (
                      <button onClick={() => updateUser(u.id, { status: "active" })} className="text-green-400 hover:text-green-300 text-xs">Restore</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 bg-gray-800 rounded text-sm text-white disabled:opacity-50">Prev</button>
          <span className="px-3 py-1 text-sm text-gray-300">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 bg-gray-800 rounded text-sm text-white disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
