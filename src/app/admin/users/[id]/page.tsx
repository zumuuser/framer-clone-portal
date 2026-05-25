"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface UserDetail {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  githubId: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  lastIp: string | null;
  createdAt: string;
  updatedAt: string;
  projects: {
    id: string;
    name: string;
    framerDomain: string;
    githubRepo: string;
    status: string;
    lastSyncAt: string | null;
    createdAt: string;
  }[];
  sessions: { id: string; expires: string }[];
}

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/users/${userId}`)
      .then(r => r.json())
      .then(data => { setUser(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  if (loading) return <div className="text-gray-400">Loading...</div>;
  if (!user) return <div className="text-red-400">User not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {user.image && <img src={user.image} alt="" className="w-12 h-12 rounded-full" />}
        <div>
          <h2 className="text-2xl font-bold text-white">{user.name || "Unnamed"}</h2>
          <div className="text-gray-400 text-sm">{user.email}</div>
        </div>
        <span className={`ml-auto px-2 py-1 rounded text-xs font-medium ${user.role === "admin" ? "bg-purple-500/20 text-purple-400" : "bg-gray-700 text-gray-300"}`}>{user.role}</span>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          user.status === "active" ? "bg-green-500/20 text-green-400" :
          user.status === "suspended" ? "bg-yellow-500/20 text-yellow-400" :
          "bg-red-500/20 text-red-400"
        }`}>{user.status}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Profile</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">GitHub ID</span><span className="text-gray-200">{user.githubId || "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Last Login</span><span className="text-gray-200">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Last IP</span><span className="text-gray-200">{user.lastIp || "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Joined</span><span className="text-gray-200">{new Date(user.createdAt).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Updated</span><span className="text-gray-200">{new Date(user.updatedAt).toLocaleString()}</span></div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Active Sessions ({user.sessions.length})</h3>
          {user.sessions.length === 0 ? (
            <div className="text-gray-500 text-sm">No active sessions</div>
          ) : (
            <div className="space-y-2">
              {user.sessions.map(s => (
                <div key={s.id} className="text-sm text-gray-300">
                  Expires: {new Date(s.expires).toLocaleString()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Projects ({user.projects.length})</h3>
        {user.projects.length === 0 ? (
          <div className="text-gray-500 text-sm">No projects</div>
        ) : (
          <div className="space-y-2">
            {user.projects.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-gray-800 rounded">
                <div>
                  <div className="text-white font-medium">{p.name}</div>
                  <div className="text-gray-400 text-xs">{p.framerDomain} → {p.githubRepo}</div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded text-xs ${p.status === "idle" ? "bg-gray-700 text-gray-300" : "bg-blue-500/20 text-blue-400"}`}>{p.status}</span>
                  {p.lastSyncAt && <div className="text-gray-500 text-xs mt-1">{new Date(p.lastSyncAt).toLocaleString()}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Link href="/admin/users" className="text-blue-400 hover:text-blue-300 text-sm">← Back to users</Link>
    </div>
  );
}
