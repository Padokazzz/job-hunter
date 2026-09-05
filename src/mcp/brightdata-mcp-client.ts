// Cliente minimo do MCP remoto da Bright Data (Indeed e outros).
// Endpoint hospedado: https://mcp.brightdata.com/mcp?token=SEU_TOKEN
// Autenticacao: token via query param (sem usuario/senha). Transporte
// Streamable HTTP (JSON-RPC sobre POST; resposta pode vir JSON ou SSE).
const BASE = "https://mcp.brightdata.com/mcp";

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, unknown>; required?: string[] };
}
interface McpResponse {
  result?: { content?: Array<{ type: string; text?: string }> };
  error?: { message?: string; code?: number };
}

function url(token: string): string {
  return `${BASE}?token=${encodeURIComponent(token)}`;
}

async function post(token: string, body: unknown): Promise<unknown> {
  const res = await fetch(url(token), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
  const ctype = res.headers.get("content-type") || "";
  const text = await res.text();
  if (res.status === 401) {
    throw new Error("Bright Data: token invalido (401). Confira BRIGHTDATA_API_TOKEN.");
  }
  if (ctype.includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      if (line.startsWith("data:")) {
        try {
          return JSON.parse(line.slice(5).trim());
        } catch {
          /* ignora nao-JSON */
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

// Lista as ferramentas disponiveis (para descobrir o nome exato da do Indeed).
export async function listBrightDataTools(token: string): Promise<McpTool[]> {
  await post(token, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "job-hunter", version: "0.1" } },
  });
  await post(token, { jsonrpc: "2.0", method: "notifications/initialized" });
  const r = (await post(token, { jsonrpc: "2.0", id: 2, method: "tools/list" })) as McpResponse | null;
  return (r?.result as { tools?: McpTool[] })?.tools ?? [];
}

// Executa uma ferramenta e retorna o conteudo ja parseado (JSON ou texto).
export async function callBrightDataTool(
  token: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  await post(token, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "job-hunter", version: "0.1" } },
  });
  await post(token, { jsonrpc: "2.0", method: "notifications/initialized" });
  const r = (await post(token, {
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
    return text;
  }
}
