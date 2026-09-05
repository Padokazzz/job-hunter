// Cliente minimo do MCP HTTP oficial da Gupy para candidatos.
// Endpoint publico (sem login): https://candidates.mcp.api.gupy.io/mcp
// Transporte: Streamable HTTP (JSON-RPC sobre POST; resposta pode vir como
// texto ou text/event-stream). O servidor e stateless (sem session id).
const MCP_URL = "https://candidates.mcp.api.gupy.io/mcp";

interface McpResponse {
  result?: { content?: Array<{ type: string; text?: string }> };
  error?: unknown;
}

async function post(body: unknown): Promise<unknown> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
  const ctype = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ctype.includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      if (line.startsWith("data:")) {
        try {
          return JSON.parse(line.slice(5).trim());
        } catch {
          /* ignora linhas nao-JSON */
        }
      }
    }
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// Executa um toolkit do MCP Gupy e retorna o conteudo ja parseado (JSON).
// Faz initialize + initialized + tools/call numa unica sessao efemera.
export async function callGupyTool(tool: string, args: Record<string, unknown>): Promise<unknown | null> {
  await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "job-hunter", version: "0.1" } },
  });
  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  const r = (await post({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: tool, arguments: args },
  })) as McpResponse | null;
  const text = r?.result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
