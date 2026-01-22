import { createAITool } from "panther";
import { z } from "zod";

const GITHUB_API_BASE = "https://api.github.com/repos/FASTR-Analytics/fastr-resource-hub/contents/methodology";

export function getToolsForMethodologyDocs() {
  return [
    createAITool({
      name: "get_methodology_docs_list",
      description:
        "Get the table of contents for FASTR methodology documentation from the GitHub repository. Returns the index.md file which contains links to all available methodology documents. English docs are in the root, French docs are in the 'fr' subdirectory.",
      inputSchema: z.object({}),
      handler: async () => {
        const url = `${GITHUB_API_BASE}/index.md`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.statusText}`);
        }
        const fileData = (await response.json()) as {
          content: string;
          encoding: string;
        };

        if (fileData.encoding === "base64") {
          const content = atob(fileData.content);
          return {
            tableOfContents: content,
          };
        }

        throw new Error("Unexpected encoding from GitHub API");
      },
      inProgressLabel: "Fetching methodology docs index...",
      completionMessage: "Retrieved methodology docs index",
    }),

    createAITool({
      name: "get_methodology_doc_content",
      description:
        "Read the content of a specific FASTR methodology documentation file. Use the file name from get_methodology_docs_list. For French docs, include 'fr/' prefix (e.g., 'fr/introduction.md').",
      inputSchema: z.object({
        fileName: z.string().describe("Name of the markdown file to read (e.g., 'introduction.md' or 'fr/introduction.md')"),
      }),
      handler: async (input) => {
        const url = `${GITHUB_API_BASE}/${input.fileName}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.statusText}`);
        }
        const fileData = (await response.json()) as {
          content: string;
          encoding: string;
          name: string;
        };

        if (fileData.encoding === "base64") {
          const content = atob(fileData.content);
          return {
            fileName: fileData.name,
            content: content,
          };
        }

        throw new Error("Unexpected encoding from GitHub API");
      },
      inProgressLabel: input => `Reading ${input.fileName}...`,
      completionMessage: input => `Read ${input.fileName}`,
    }),
  ];
}
