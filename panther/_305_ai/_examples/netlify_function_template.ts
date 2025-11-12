// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

/**
 * Netlify Function Template for Anthropic API Proxy
 *
 * This template provides a serverless function that proxies requests to the
 * Anthropic API. It handles both streaming and non-streaming responses, manages
 * API keys securely via environment variables, and supports all Anthropic features
 * including prompt caching.
 *
 * SETUP INSTRUCTIONS:
 *
 * 1. Install dependencies:
 *    npm install --save-dev @netlify/functions netlify-cli
 *
 * 2. Create netlify.toml in your project root:
 *    [build]
 *      command = "npm run build"
 *      publish = "dist"
 *
 *    [[redirects]]
 *      from = "/*"
 *      to = "/index.html"
 *      status = 200
 *
 * 3. Update package.json scripts:
 *    "scripts": {
 *      "dev": "netlify dev",
 *      "dev-vite": "vite",
 *      "build": "vite build"
 *    }
 *
 * 4. Create .env file with your API key:
 *    ANTHROPIC_API_KEY=your_api_key_here
 *
 * 5. Copy this file to netlify/functions/ai.ts in your project
 *
 * 6. Customize the CUSTOMIZATION sections below for your use case
 *
 * USAGE:
 *
 * Your _305_ai module will automatically call this endpoint at /api/ai when
 * configured with:
 *
 *   apiConfig: {
 *     endpoint: "/api/ai"
 *   }
 */

import type { Context } from "@netlify/functions";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export default async (req: Request, _context: Context) => {
  // ============================================================================
  // SECURITY & VALIDATION
  // ============================================================================

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  // ============================================================================
  // CUSTOMIZATION POINT 1: Request Validation & Modification
  // ============================================================================
  // Add custom validation, rate limiting, user authentication, etc. here
  // Example:
  //   const userId = await getUserFromRequest(req);
  //   if (!userId) return unauthorized();
  //
  //   const rateLimitOk = await checkRateLimit(userId);
  //   if (!rateLimitOk) return tooManyRequests();

  try {
    const body = await req.json();
    // Extract custom fields (stream, conversationId) before forwarding to Anthropic
    // conversationId is used by _305_ai module for conversation persistence, not sent to API
    const { stream = false, conversationId, ...anthropicPayload } = body;

    // ============================================================================
    // CUSTOMIZATION POINT 2: Payload Modification
    // ============================================================================
    // Modify the payload before sending to Anthropic
    // Example: Force specific parameters, add metadata, etc.
    //   anthropicPayload.metadata = {
    //     user_id: userId,
    //     session_id: sessionId
    //   };
    //   anthropicPayload.max_tokens = Math.min(anthropicPayload.max_tokens, 8192);

    // ============================================================================
    // REQUEST TO ANTHROPIC API
    // ============================================================================

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };

    // Enable prompt caching beta if needed
    if (
      stream ||
      anthropicPayload.system?.some?.((block: any) => block.cache_control)
    ) {
      headers["anthropic-beta"] = "prompt-caching-2024-07-31";
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...anthropicPayload,
        stream,
      }),
    });

    // ============================================================================
    // ERROR HANDLING
    // ============================================================================

    if (!response.ok) {
      const error = await response.text();

      // ============================================================================
      // CUSTOMIZATION POINT 3: Error Logging
      // ============================================================================
      // Log errors to your monitoring service
      // Example:
      //   await logError({
      //     userId,
      //     statusCode: response.status,
      //     error,
      //     timestamp: new Date()
      //   });

      return new Response(
        JSON.stringify({
          error: `Anthropic API error: ${response.status} - ${error}`,
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // ============================================================================
    // RESPONSE HANDLING
    // ============================================================================

    if (stream) {
      // Streaming response - pass through as Server-Sent Events
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Non-streaming response
    const data = await response.json();

    // ============================================================================
    // CUSTOMIZATION POINT 4: Response Logging & Analytics
    // ============================================================================
    // Track usage, costs, etc.
    // Example:
    //   await logUsage({
    //     userId,
    //     inputTokens: data.usage?.input_tokens,
    //     outputTokens: data.usage?.output_tokens,
    //     model: data.model,
    //     timestamp: new Date()
    //   });

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // ============================================================================
    // CUSTOMIZATION POINT 5: Exception Logging
    // ============================================================================
    // Log unexpected errors
    // Example:
    //   await logException({
    //     error: error instanceof Error ? error : new Error(String(error)),
    //     context: { endpoint: '/api/ai' }
    //   });

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

// ============================================================================
// NETLIFY CONFIGURATION
// ============================================================================
// This configures the function path. The function will be available at /api/ai
// Customize this path if needed.

export const config = {
  path: "/api/ai",
};
