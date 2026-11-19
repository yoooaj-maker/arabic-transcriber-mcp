
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

function createServer(env) {
  const server = new McpServer({
    name: "arabic-transcriber",
    version: "1.0.0"
  });

  server.registerTool(
    "transcribe_audio",
    {
      description:
        "Transcribe audio or video from a public HTTPS URL with word and segment timestamps.",
      inputSchema: z.object({
        url: z.string().url(),
        language: z.string().default("ar"),
        prompt: z.string().optional()
      })
    },
    async ({ url, language, prompt }) => {
      try {
        if (!env.GROQ_API_KEY) {
          throw new Error("GROQ_API_KEY is not configured.");
        }

        const audioUrl = new URL(url);

        if (audioUrl.protocol !== "https:") {
          throw new Error("Use a public HTTPS URL.");
        }

        const groqResponse = await fetch(
          "https://api.groq.com/openai/v1/audio/transcriptions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.GROQ_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              url: audioUrl.href,
              model: "whisper-large-v3",
              language,
              response_format: "verbose_json",
              timestamp_granularities: ["word", "segment"],
              temperature: 0,
              ...(prompt ? { prompt } : {})
            })
          }
        );

        const result = await groqResponse.json();

        if (!groqResponse.ok) {
          throw new Error(
            result.error?.message || "Groq transcription failed."
          );
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result)
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: error.message || "Transcription failed."
          }]
        };
      }
    }
  );

  return server;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== "/mcp") {
      return new Response("Arabic Transcriber MCP is running.");
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, Accept, MCP-Protocol-Version, MCP-Session-Id"
        }
      });
    }

    if (!env.MCP_TOKEN || !env.GROQ_API_KEY) {
      return new Response("Server secrets are not configured.", {
        status: 500
      });
    }

    if (
      request.headers.get("Authorization") !==
      `Bearer ${env.MCP_TOKEN}`
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    const handler = createMcpHandler(() => createServer(env));
    return handler(request, env, ctx);
  }
};
