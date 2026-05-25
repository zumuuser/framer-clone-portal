import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Session } from "next-auth";

async function checkAdmin() {
  const session = (await getServerSession(authOptions)) as Session | null;
  if (!session?.user?.email) redirect("/");
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (user?.role !== "admin") redirect("/");
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await checkAdmin();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-screen bg-gray-900 border-r border-gray-800 p-4">
          <h1 className="text-xl font-bold text-white mb-6 px-2">Admin Panel</h1>
          <nav className="space-y-1">
            <Link
              href="/admin"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/users"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Users
            </Link>
            <Link
              href="/admin/activity"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Activity Log
            </Link>
            <Link
              href="/admin/security"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Security
            </Link>
            <Link
              href="/admin/audit-log"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              ACSS Audit Log
            </Link>
            <Link
              href="https://dashboard.clone.webyverse.com"
              target="_blank"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Grafana →
            </Link>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
