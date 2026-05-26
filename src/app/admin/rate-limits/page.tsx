"use client";

import { useEffect, useState } from "react";

interface RateLimitRule {
  id: string;
  route: string;
  identifier: string;
  windowMs: number;
  maxRequests: number;
  description: string | null;
  updatedAt: string;
}

export default function RateLimitsPage() {
  const [rules, setRules] = useState<RateLimitRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ route: "", windowMs: 60000, maxRequests: 100, description: "" });

  async function fetchRules() {
    setLoading(true);
    const res = await fetch("/api/admin/rate-limits");
    const data = await res.json();
    setRules(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchRules();
  }, []);

  async function saveRule() {
    if (!form.route) {
      setMessage("Route is required.");
      return;
    }
    const res = await fetch("/api/admin/rate-limits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage("Rate limit saved.");
      setForm({ route: "", windowMs: 60000, maxRequests: 100, description: "" });
      setEditing(null);
      fetchRules();
      setTimeout(() => setMessage(""), 3000);
    } else {
      setMessage(`Error: ${data.error || "Save failed"}`);
    }
  }

  function startEdit(rule: RateLimitRule) {
    setForm({
      route: rule.route,
      windowMs: rule.windowMs,
      maxRequests: rule.maxRequests,
      description: rule.description || "",
    });
    setEditing(rule.id);
  }

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-2xl font-bold text-white">Rate Limits</h2>
      <p className="text-gray-400 text-sm">Manage per-route rate limiting rules. Changes apply immediately.</p>

      {message && (
        <div className="bg-blue-900/30 border border-blue-800 text-blue-200 px-4 py-2 rounded">{message}</div>
      )}

      {/* Add/Edit Form */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">{editing ? "Edit Rule" : "Add New Rule"}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Route Pattern</label>
            <input
              type="text"
              value={form.route}
              onChange={(e) => setForm({ ...form, route: e.target.value })}
              placeholder="e.g. /api/projects or /api/admin/*"
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description"
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Window (ms)</label>
            <input
              type="number"
              value={form.windowMs}
              onChange={(e) => setForm({ ...form, windowMs: parseInt(e.target.value) || 0 })}
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Max Requests</label>
            <input
              type="number"
              value={form.maxRequests}
              onChange={(e) => setForm({ ...form, maxRequests: parseInt(e.target.value) || 0 })}
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={saveRule} className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-500">
            {editing ? "Update Rule" : "Add Rule"}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm({ route: "", windowMs: 60000, maxRequests: 100, description: "" }); }} className="px-4 py-2 rounded bg-gray-800 text-gray-300 text-sm hover:bg-gray-700">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Rules Table */}
      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-400 uppercase bg-gray-800">
              <tr>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Window</th>
                <th className="px-4 py-3">Max Requests</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-gray-400 text-center">No custom rate limit rules configured.</td></tr>
              )}
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono text-blue-300">{rule.route}</td>
                  <td className="px-4 py-3 text-gray-400">{rule.description || "—"}</td>
                  <td className="px-4 py-3">{(rule.windowMs / 1000).toFixed(0)}s</td>
                  <td className="px-4 py-3">{rule.maxRequests}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => startEdit(rule)} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
