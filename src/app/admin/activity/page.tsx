"use client";

import { useEffect, useState } from "react";

interface AuditLog {
  id: string;
  action: string;
  resource: string;
  metadata: string | null;
  ip: string | null;
  createdAt: string;
  user: { id: string; email: string | null; name: string | null } | null;
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(false);

  async function fetchLogs() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (actionFilter) params.set("action", actionFilter);
    const res = await fetch(`/api/admin/activity?${params}`);
    const data = await res.json();
    setLogs(data.logs || []);
    setTotal(data.total || 0);
    setLoading(false);
  }

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Activity Log</h2>
        <div className="text-sm text-gray-400">{total} events</div>
      </div>

      <div className="flex gap-3">
        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white">
          <option value="">All actions</option>
          <option value="user.update">User Update</option>
          <option value="rateLimit.update">Rate Limit Update</option>
        </select>
        <button onClick={fetchLogs} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white">Refresh</button>
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-800 text-gray-300 uppercase text-xs">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Resource</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-gray-800 hover:bg-gray-800/50">
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400">{log.action}</span>
                </td>
                <td className="px-4 py-3 text-gray-300">{log.user?.email || "System"}</td>
                <td className="px-4 py-3 text-gray-300 font-mono text-xs">{log.resource}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{log.ip || "—"}</td>
                <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{log.metadata || "—"}</td>
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
