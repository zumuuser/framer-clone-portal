import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { NextResponse } from "next/server";

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { error: "Unauthorized", status: 401 };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, email: true },
  });

  if (!user || user.role !== "admin") {
    return { error: "Forbidden: Admin access required", status: 403 };
  }

  return { user };
}

export function adminJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
