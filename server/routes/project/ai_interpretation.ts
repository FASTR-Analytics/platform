import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { getAIInterpretation } from "../../ai/get_ai_interpretation.ts";
import { getChatbotSystemPrompt } from "../../ai/chatbot_system_prompt.ts";
import { hmisTools } from "lib";
import { getGlobalNonAdmin, getProjectViewer } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import {
  getVisualizationsListForProject,
  getVisualizationDataForAI,
  getModulesListForProject,
} from "../../db/mod.ts";

export const routesAi = new Hono();

defineRoute(
  routesAi,
  "getAiInterpretation",
  getProjectViewer,
  async (c, { body }) => {
    const data = await getAIInterpretation(
      body.figureInputs,
      body.additionalInstructions,
      body.additionalContext
    );
    return c.json({ success: true, data });
  }
);

defineRoute(
  routesAi,
  "chatbot",
  getGlobalNonAdmin,
  getProjectViewer,
  async (c, { body }) => {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return c.json(
        { success: false, error: "ANTHROPIC_API_KEY not configured" },
        500
      );
    }

    // Get project AI context
    const projectRow = await c.var.mainDb<{ ai_context: string }[]>`
      SELECT ai_context FROM projects WHERE id = ${c.var.ppk.projectId}
    `;
    const aiContext = projectRow.at(0)?.ai_context ?? "";

    const systemPrompt = getChatbotSystemPrompt(aiContext);
    const anthropic = new Anthropic({ apiKey });

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: body.messages as Anthropic.Messages.MessageParam[],
        tools: hmisTools,
      });

      return c.json({
        success: true,
        data: {
          content: response.content,
          stop_reason: response.stop_reason,
        },
      });
    } catch (error) {
      console.error("Anthropic API error:", error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);

defineRoute(routesAi, "getModulesList", getProjectViewer, async (c) => {
  const res = await getModulesListForProject(c.var.ppk.projectDb);
  return c.json(res);
});

defineRoute(routesAi, "getVisualizationsList", getProjectViewer, async (c) => {
  const res = await getVisualizationsListForProject(c.var.ppk.projectDb);
  return c.json(res);
});

defineRoute(
  routesAi,
  "getVisualizationDataForAI",
  getGlobalNonAdmin,
  getProjectViewer,
  async (c, { params }) => {
    const res = await getVisualizationDataForAI(
      c.var.mainDb,
      c.var.ppk.projectDb,
      c.var.ppk.projectId,
      params.po_id
    );
    return c.json(res);
  }
);
