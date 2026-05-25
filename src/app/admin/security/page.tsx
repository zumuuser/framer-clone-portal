"use client";

import { useEffect, useState } from "react";

interface SecurityData {
  checks: Record<string, boolean>;
  stats: {
    userCount: number;
    adminCount: number;
    activeUsers: number;
    suspendedUsers: number;
    bannedUsers: number;
    projectCount: number;
    syncCount: number;
  };
  timestamp: string;
}

export default function SecurityDashboard() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/security")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400">Loading security status...</div>;
  if (!data) return <div className="text-red-400">Failed to load security data</div>;

  const allPass = Object.values(data.checks).every(Boolean);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-white">Security Dashboard</h2>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full animate-pulse ${allPass ? "bg-green-500" : "bg-red-500"}`} />
          <div>
            <div className="text-lg font-semibold text-white">{allPass ? "System Secure" : "Issues Detected"}</div>
            <div className="text-sm text-gray-400">Last check: {new Date(data.timestamp).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={data.stats.userCount} color="blue" />
        <StatCard label="Admins" value={data.stats.adminCount} color="purple" />
        <StatCard label="Active" value={data.stats.activeUsers} color="green" />
        <StatCard label="Suspended" value={data.stats.suspendedUsers} color="yellow" />
        <StatCard label="Banned" value={data.stats.bannedUsers} color="red" />
        <StatCard label="Projects" value={data.stats.projectCount} color="blue" />
        <StatCard label="Syncs" value={data.stats.syncCount} color="gray" />
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Security Checks</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(data.checks).map(([key, status]) => (
            <div key={key} className={`flex items-center justify-between p-3 rounded border ${status ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <span className="text-sm text-gray-200">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
              <span className={`text-sm font-medium ${status ? "text-green-400" : "text-red-400"}`}>{status ? "PASS" : "FAIL"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    purple: "border-purple-500/30 bg-purple-500/10 text-purple-400",
    green: "border-green-500/30 bg-green-500/10 text-green-400",
    yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
    red: "border-red-500/30 bg-red-500/10 text-red-400",
    gray: "border-gray-500/30 bg-gray-500/10 text-gray-400",
  };
  return (
    <div className={`rounded-lg border p-4 text-center ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase mt-1">{label}</div>
    </div>
  );
}
