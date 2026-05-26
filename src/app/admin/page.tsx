"use client";

import { useEffect, useState } from "react";

interface Stats {
  totalUsers: number;
  totalProjects: number;
  totalSyncs: number;
  syncSuccessRate: number;
  recentSyncs: Array<{
    id: string;
    projectName: string;
    status: string;
    changesDetected: boolean;
    startedAt: string;
    errorMessage: string | null;
  }>;
  syncBreakdown: Array<{ status: string; _count: { status: number } }>;
  activeUsers?: number;
  suspendedUsers?: number;
  bannedUsers?: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error) return <div className="text-red-400 p-8">Error: {error}</div>;
  if (!stats) return <div className="text-red-400 p-8">Failed to load stats</div>;

  const recentSyncs = stats.recentSyncs || [];
  const syncBreakdown = stats.syncBreakdown || [];

  return (
    <div className="space-y-8 p-6">
      <h2 className="text-2xl font-bold text-white">Dashboard</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard label="Total Users" value={stats.totalUsers ?? 0} color="blue" />
        <KpiCard label="Total Projects" value={stats.totalProjects ?? 0} color="green" />
        <KpiCard label="Total Syncs" value={stats.totalSyncs ?? 0} color="purple" />
        <KpiCard label="Sync Success Rate" value={`${stats.syncSuccessRate ?? 0}%`} color={stats.syncSuccessRate >= 95 ? "green" : stats.syncSuccessRate >= 80 ? "yellow" : "red"} />
      </div>

      {/* User Status Breakdown */}
      {(stats.activeUsers !== undefined) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard label="Active Users" value={stats.activeUsers ?? 0} color="green" />
          <KpiCard label="Suspended Users" value={stats.suspendedUsers ?? 0} color="yellow" />
          <KpiCard label="Banned Users" value={stats.bannedUsers ?? 0} color="red" />
        </div>
      )}

      {/* Recent Syncs */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Syncs ({recentSyncs.length})</h3>
        {recentSyncs.length === 0 ? (
          <p className="text-gray-400">No syncs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-400 uppercase bg-gray-800">
                <tr>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Changes</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody>
                {recentSyncs.map((sync) => (
                  <tr key={sync.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-3 font-medium">{sync.projectName}</td>
                    <td className="px-4 py-3"><StatusBadge status={sync.status} /></td>
                    <td className="px-4 py-3">{sync.changesDetected ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-gray-400">{new Date(sync.startedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-red-400 max-w-xs truncate">{sync.errorMessage || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sync Breakdown */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Sync Status Breakdown</h3>
        {syncBreakdown.length === 0 ? (
          <p className="text-gray-400">No data.</p>
        ) : (
          <div className="flex gap-4 flex-wrap">
            {syncBreakdown.map((item) => (
              <div key={item.status} className="bg-gray-800 rounded-lg px-4 py-3 min-w-[120px]">
                <div className="text-xs text-gray-400 uppercase">{item.status}</div>
                <div className="text-2xl font-bold text-white">{item._count?.status ?? 0}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue: "border-blue-500/30 bg-blue-500/10",
    green: "border-green-500/30 bg-green-500/10",
    purple: "border-purple-500/30 bg-purple-500/10",
    yellow: "border-yellow-500/30 bg-yellow-500/10",
    red: "border-red-500/30 bg-red-500/10",
  };
  return (
    <div className={`rounded-lg border p-6 ${colors[color] ?? colors.blue}`}>
      <div className="text-sm text-gray-400">{label}</div>
      <div className="text-3xl font-bold text-white mt-1">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: "bg-green-500/20 text-green-400",
    error: "bg-red-500/20 text-red-400",
    running: "bg-blue-500/20 text-blue-400",
    pending: "bg-gray-500/20 text-gray-400",
  };
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] ?? colors.pending}`}>
      {status}
    </span>
  );
}
