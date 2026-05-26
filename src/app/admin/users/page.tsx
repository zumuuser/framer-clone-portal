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
  projectLimit: number;
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
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState("");

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

  async function updateUser(userId: string, updates: Partial<{ role: string; status: string; projectLimit: number }>) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...updates }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage("User updated.");
      fetchUsers();
      setTimeout(() => setMessage(""), 3000);
    } else {
      setMessage(`Error: ${data.error || "Update failed"}`);
    }
  }

  async function saveProjectLimit(userId: string) {
    const limit = parseInt(editLimit);
    if (isNaN(limit) || limit < 0) {
      setMessage("Invalid limit.");
      return;
    }
    await updateUser(userId, { projectLimit: limit });
    setEditingUser(null);
    setEditLimit("");
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Users</h2>
        <span className="text-gray-400">{total} total</span>
      </div>

      {message && (
        <div className="bg-blue-900/30 border border-blue-800 text-blue-200 px-4 py-2 rounded">{message}</div>
      )}

      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white"
        >
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-400 uppercase bg-gray-800">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Projects</th>
                  <th className="px-4 py-3">Project Limit</th>
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{user.name || "No name"}</div>
                      <div className="text-gray-400 text-xs">{user.email || user.githubId || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${user.role === "admin" ? "bg-purple-500/20 text-purple-400" : "bg-gray-500/20 text-gray-400"}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        user.status === "active" ? "bg-green-500/20 text-green-400" :
                        user.status === "suspended" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${user.id}`} className="text-blue-400 hover:text-blue-300 underline">
                        {user._count.projects}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {editingUser === user.id ? (
                        <div className="flex gap-2 items-center">
                          <input
                            type="number"
                            min="0"
                            defaultValue={user.projectLimit}
                            onChange={(e) => setEditLimit(e.target.value)}
                            className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white"
                            autoFocus
                          />
                          <button onClick={() => saveProjectLimit(user.id)} className="text-green-400 text-xs">Save</button>
                          <button onClick={() => { setEditingUser(null); setEditLimit(""); }} className="text-gray-400 text-xs">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingUser(user.id); setEditLimit(String(user.projectLimit)); }} className="text-blue-400 hover:text-blue-300 text-xs">
                          {user.projectLimit}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateUser(user.id, { role: user.role === "admin" ? "user" : "admin" })}
                          className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700"
                        >
                          {user.role === "admin" ? "Demote" : "Promote"}
                        </button>
                        {user.status !== "suspended" && (
                          <button
                            onClick={() => updateUser(user.id, { status: "suspended" })}
                            className="text-xs px-2 py-1 rounded bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50"
                          >
                            Suspend
                          </button>
                        )}
                        {user.status !== "banned" && (
                          <button
                            onClick={() => updateUser(user.id, { status: "banned" })}
                            className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50"
                          >
                            Ban
                          </button>
                        )}
                        {(user.status === "suspended" || user.status === "banned") && (
                          <button
                            onClick={() => updateUser(user.id, { status: "active" })}
                            className="text-xs px-2 py-1 rounded bg-green-900/30 text-green-400 hover:bg-green-900/50"
                          >
                            Restore
                          </button>
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
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-gray-400 px-2">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
