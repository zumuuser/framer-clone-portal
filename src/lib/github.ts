import { Octokit } from "octokit";

export function getOctokit(token: string) {
  return new Octokit({ auth: token });
}

export async function listRepos(octokit: Octokit) {
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    per_page: 100,
    sort: "updated",
  });
  return data;
}

export async function createRepo(octokit: Octokit, name: string, description?: string) {
  const { data } = await octokit.rest.repos.createForAuthenticatedUser({
    name,
    description: description || `FramerClone export for ${name}`,
    private: false,
    auto_init: true,
  });
  return data;
}

export async function getLatestCommit(octokit: Octokit, owner: string, repo: string, branch: string) {
  const { data } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  return data.object.sha;
}

export async function createTreeAndCommit(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  files: { path: string; content: Buffer }[],
  message: string
) {
  let latestCommitSha: string | null = null;
  let baseTreeSha: string | undefined;

  try {
    latestCommitSha = await getLatestCommit(octokit, owner, repo, branch);
    const { data: latestCommit } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: latestCommitSha,
    });
    baseTreeSha = latestCommit.tree.sha;
  } catch (err: any) {
    // Repo is empty (409) or branch doesn't exist (404) — seed it first
    if (err.status !== 409 && err.status !== 404) {
      throw err;
    }

    // GitHub's low-level git API (blobs/trees) doesn't work on truly empty repos.
    // Create an initial README so the repo has a commit + branch.
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: "README.md",
      message: "Initial commit",
      content: Buffer.from(`# ${repo}\n\nFramerClone export`).toString("base64"),
      branch,
    });

    // Now fetch the commit we just created
    latestCommitSha = await getLatestCommit(octokit, owner, repo, branch);
    const { data: latestCommit } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: latestCommitSha,
    });
    baseTreeSha = latestCommit.tree.sha;
  }

  const treeEntries = await Promise.all(
    files.map(async (file) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: file.content.toString("base64"),
        encoding: "base64",
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    })
  );

  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeEntries,
  });

  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.sha,
    parents: latestCommitSha ? [latestCommitSha] : [],
  });

  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commit.sha,
  });

  return commit.sha;
}

export async function rollbackToCommit(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  commitSha: string
) {
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commitSha,
    force: true,
  });
}
