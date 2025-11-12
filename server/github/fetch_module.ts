import { APIResponseWithData } from "lib";

export type GitHubCommit = {
  sha: string;
  message: string;
  date: string;
  author: string;
};

function stripFrontmatter(script: string): string {
  const lines = script.split("\n");
  const markerIndex = lines.findIndex((line) =>
    line.trimStart().startsWith("#---")
  );

  if (markerIndex === -1) {
    return script;
  }

  return lines.slice(markerIndex).join("\n");
}

export async function fetchCommits(
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<APIResponseWithData<GitHubCommit[]>> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?path=${path}&sha=${branch}&per_page=10`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        return {
          success: false,
          err: "GitHub API rate limit exceeded. Try again later.",
        };
      }
      if (response.status === 404) {
        return {
          success: false,
          err: "Repository or path not found on GitHub.",
        };
      }
      return {
        success: false,
        err: `GitHub API error: ${response.status} ${response.statusText}`,
      };
    }

    const commits = await response.json();

    const formattedCommits: GitHubCommit[] = commits.map((commit: any) => ({
      sha: commit.sha,
      message: commit.commit.message.split("\n")[0], // First line only
      date: commit.commit.author.date,
      author: commit.commit.author.name,
    }));

    return { success: true, data: formattedCommits };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      err: `Failed to fetch commits: ${errorMessage}`,
    };
  }
}

export async function fetchRawScript(
  owner: string,
  repo: string,
  path: string,
  commit: string
): Promise<APIResponseWithData<string>> {
  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${path}`;

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          err: "Script file not found at this commit.",
        };
      }
      return {
        success: false,
        err: `Failed to fetch script: ${response.status} ${response.statusText}`,
      };
    }

    const rawScript = await response.text();

    if (!rawScript || rawScript.trim().length === 0) {
      return {
        success: false,
        err: "Fetched script is empty.",
      };
    }

    const script = stripFrontmatter(rawScript);

    return { success: true, data: script };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      err: `Failed to fetch script: ${errorMessage}`,
    };
  }
}
