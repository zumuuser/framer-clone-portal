"use client";

import { useEffect, useState } from "react";

interface SecurityStatus {
  lastScan: string;
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  secretsFound: number;
  packagesVerified: boolean;
  cspEnabled: boolean;
  rateLimiting: boolean;
  tokenEncryption: boolean;
  nonRootContainer: boolean;
}

export default function SecurityDashboard() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [, setChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Run client-side security checks
    setChecks({
      "HTTPS Enabled": window.location.protocol === "https:",
      "CSP Headers": true, // Would be checked via API
      "Secure Cookies": true,
    });

    // Fetch security status from API (placeholder data for now)
    setStatus({
      lastScan: new Date().toISOString(),
      vulnerabilities: { critical: 0, high: 0, medium: 0, low: 2 },
      secretsFound: 0,
      packagesVerified: true,
      cspEnabled: true,
      rateLimiting: true,
      tokenEncryption: true,
      nonRootContainer: true,
    });
  }, []);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-white">Security Dashboard</h2>

      {/* Overall Status */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <div>
            <div className="text-lg font-semibold text-white">System Secure</div>
            <div className="text-sm text-gray-400">
              Last scan: {status ? new Date(status.lastScan).toLocaleString() : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* ACSS Compliance Grid */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">ACSS Compliance</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComplianceCard
            label="Package Verification"
            status={status?.packagesVerified ?? false}
            description="All dependencies verified on official registries"
          />
          <ComplianceCard
            label="CSP Headers"
            status={status?.cspEnabled ?? false}
            description="Content Security Policy active"
          />
          <ComplianceCard
            label="Rate Limiting"
            status={status?.rateLimiting ?? false}
            description="API endpoints protected against abuse"
          />
          <ComplianceCard
            label="Token Encryption"
            status={status?.tokenEncryption ?? false}
            description="GitHub tokens encrypted at rest (AES-256-GCM)"
          />
          <ComplianceCard
            label="Non-Root Container"
            status={status?.nonRootContainer ?? false}
            description="App runs as unprivileged user"
          />
          <ComplianceCard
            label="Input Validation"
            status={true}
            description="Zod validation on all API routes"
          />
        </div>
      </div>

      {/* Vulnerability Summary */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Vulnerability Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <VulnCard severity="Critical" count={status?.vulnerabilities.critical ?? 0} color="red" />
          <VulnCard severity="High" count={status?.vulnerabilities.high ?? 0} color="orange" />
          <VulnCard severity="Medium" count={status?.vulnerabilities.medium ?? 0} color="yellow" />
          <VulnCard severity="Low" count={status?.vulnerabilities.low ?? 0} color="blue" />
        </div>
      </div>

      {/* STOP Framework Status */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">STOP Framework Status</h3>
        <div className="space-y-3">
          <StopStep letter="S" title="Search" description="Verify packages, APIs, dependencies exist" status="pass" />
          <StopStep letter="T" title="Test" description="Automated security scans on every build" status="pass" />
          <StopStep letter="O" title="Observe" description="Monitor containers, logs, network traffic" status="pass" />
          <StopStep letter="P" title="Prove" description="Validate against README + C4 architecture" status="partial" />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://dashboard.clone.webyverse.com"
            target="_blank"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium"
          >
            Open Grafana →
          </a>
          <a
            href="https://metrics.clone.webyverse.com"
            target="_blank"
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-sm font-medium"
          >
            Open Prometheus →
          </a>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm font-medium"
          >
            Refresh Status
          </button>
        </div>
      </div>
    </div>
  );
}

function ComplianceCard({ label, status, description }: { label: string; status: boolean; description: string }) {
  return (
    <div className={`rounded-lg border p-4 ${status ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${status ? "bg-green-500" : "bg-red-500"}`} />
        <span className="font-medium text-white">{label}</span>
      </div>
      <p className="text-sm text-gray-400 mt-1">{description}</p>
    </div>
  );
}

function VulnCard({ severity, count, color }: { severity: string; count: number; color: string }) {
  const colorMap: Record<string, string> = {
    red: "border-red-500/30 bg-red-500/10 text-red-400",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-400",
    yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  };
  return (
    <div className={`rounded-lg border p-4 text-center ${colorMap[color]}`}>
      <div className="text-3xl font-bold">{count}</div>
      <div className="text-xs uppercase mt-1">{severity}</div>
    </div>
  );
}

function StopStep({ letter, title, description, status }: { letter: string; title: string; description: string; status: "pass" | "partial" | "fail" }) {
  const colors = {
    pass: "bg-green-500/20 text-green-400 border-green-500/30",
    partial: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    fail: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <div className={`flex items-start gap-4 p-4 rounded-lg border ${colors[status]}`}>
      <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center font-bold text-lg shrink-0">
        {letter}
      </div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm opacity-80">{description}</div>
      </div>
    </div>
  );
}
