import { NextResponse } from "next/server";
import { getServerSessionWithToken } from "@/lib/session";
import { getOctokit, listRepos, createRepo } from "@/lib/github";

export async function GET() {
  const session = await getServerSessionWithToken();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const octokit = getOctokit(session.accessToken);
    const repos = await listRepos(octokit);
    return NextResponse.json(repos);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to fetch repos", message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getServerSessionWithToken();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, description } = await req.json();
    const octokit = getOctokit(session.accessToken);
    const repo = await createRepo(octokit, name, description);
    return NextResponse.json(repo, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to create repo", message },
      { status: 500 }
    );
  }
}
