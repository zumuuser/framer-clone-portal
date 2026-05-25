"use client";

import { useEffect, useState } from "react";

interface ActionLog {
  id: string;
  action: string;
  resource: string;
  reason: string;
  decisionPoint: string;
  result: string;
  acssLayer: string | null;
  stopStep: string | null;
  createdAt: string;
  user?: { email: string | null; name: string | null } | null;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ acssLayer: "", stopStep: "", result: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLogs(); }, [filter]);

  async function fetchLogs() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.acssLayer) params.set("acssLayer", filter.acssLayer);
    if (filter.stopStep) params.set("stopStep", filter.stopStep);
    if (filter.result) params.set("result", filter.result);
    const res = await fetch(`/api/admin/audit-log?${params}`);
    const data = await res.json();
    setLogs(data.logs || []);
    setTotal(data.total || 0);
    setLoading(false);
  }

  const layerColor = (layer: string | null) => {
    if (layer === "Prevent") return "bg-blue-100 text-blue-800";
    if (layer === "Detect") return "bg-yellow-100 text-yellow-800";
    if (layer === "Verify") return "bg-green-100 text-green-800";
    return "bg-gray-100 text-gray-800";
  };

  const stepColor = (step: string | null) => {
    if (step === "Search") return "bg-purple-100 text-purple-800";
    if (step === "Test") return "bg-orange-100 text-orange-800";
    if (step === "Observe") return "bg-cyan-100 text-cyan-800";
    if (step === "Prove") return "bg-emerald-100 text-emerald-800";
    return "bg-gray-100 text-gray-800";
  };

  const resultColor = (result: string) => {
    if (result === "success") return "bg-green-100 text-green-800";
    if (result === "failure") return "bg-red-100 text-red-800";
    if (result === "partial") return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">ACSS Action Logging Portal</h1>
      <p className="text-gray-600 mb-6">Every deployment action logged with ACSS layer mapping and STOP framework step. Total: {total} entries</p>
      <div className="flex gap-4 mb-6">
        <select className="border rounded px-3 py-2" value={filter.acssLayer} onChange={(e) => setFilter({ ...filter, acssLayer: e.target.value })}>
          <option value="">All ACSS Layers</option><option value="Prevent">Prevent</option><option value="Detect">Detect</option><option value="Verify">Verify</option>
        </select>
        <select className="border rounded px-3 py-2" value={filter.stopStep} onChange={(e) => setFilter({ ...filter, stopStep: e.target.value })}>
          <option value="">All STOP Steps</option><option value="Search">Search</option><option value="Test">Test</option><option value="Observe">Observe</option><option value="Prove">Prove</option>
        </select>
        <select className="border rounded px-3 py-2" value={filter.result} onChange={(e) => setFilter({ ...filter, result: e.target.value })}>
          <option value="">All Results</option><option value="success">Success</option><option value="failure">Failure</option><option value="partial">Partial</option><option value="pending">Pending</option>
        </select>
      </div>
      {loading ? <p>Loading...</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-gray-50"><tr>
            <th className="px-3 py-2 text-left">Time</th><th className="px-3 py-2 text-left">Action</th><th className="px-3 py-2 text-left">Resource</th>
            <th className="px-3 py-2 text-left">Reason</th><th className="px-3 py-2 text-left">Decision</th>
            <th className="px-3 py-2 text-left">ACSS</th><th className="px-3 py-2 text-left">STOP</th><th className="px-3 py-2 text-left">Result</th>
          </tr></thead><tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2 font-medium">{log.action}</td>
                <td className="px-3 py-2">{log.resource}</td>
                <td className="px-3 py-2 max-w-xs truncate" title={log.reason}>{log.reason}</td>
                <td className="px-3 py-2 max-w-xs truncate" title={log.decisionPoint}>{log.decisionPoint}</td>
                <td className="px-3 py-2">{log.acssLayer && <span className={`px-2 py-1 rounded text-xs font-medium ${layerColor(log.acssLayer)}`}>{log.acssLayer}</span>}</td>
                <td className="px-3 py-2">{log.stopStep && <span className={`px-2 py-1 rounded text-xs font-medium ${stepColor(log.stopStep)}`}>{log.stopStep}</span>}</td>
                <td className="px-3 py-2"><span className={`px-2 py-1 rounded text-xs font-medium ${resultColor(log.result)}`}>{log.result}</span></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
