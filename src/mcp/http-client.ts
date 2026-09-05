// Cliente HTTP MCP generico (Streamable HTTP / JSON-RPC). Reutilizado pelas
// fontes que consomem MCP remoto ou local (Gupy, Bright Data, LinkedIn).
// Opcionalmente anexa um token como query param (?token=...). Suporta servidores
// stateful: captura o "mcp-session-id" do initialize e o reenvia nas chamadas.
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, unknown>; required?: string[] };
}
export interface McpCallOptions {
  url: string;
  token?: string;
  tokenQuery?: string;
  tool: string;
  args: Record<string, unknown>;
}

interface McpResponse {
  result?: { content?: Array<{ type: string; text?: string }>; tools?: McpTool[] };
  error?: { message?: string; code?: number };
}

interface Session {
  sessionId?: string;
}

function endpoint(opts: { url: string; token?: string; tokenQuery?: string }): string {
  if (!opts.token) return opts.url;
  const q = opts.tokenQuery ?? "token";
  const sep = opts.url.includes("?") ? "&" : "?";
  return `${opts.url}${sep}${q}=${encodeURIComponent(opts.token)}`;
}

async function post(
  opts: { url: string; token?: string; tokenQuery?: string },
  body: unknown,
  session: Session,
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (session.sessionId) headers["Mcp-Session-Id"] = session.sessionId;
  const res = await fetch(endpoint(opts), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const sid = res.headers.get("mcp-session-id") ?? res.headers.get("Mcp-Session-Id");
  if (sid) session.sessionId = sid;
  if (res.status === 401) throw new Error("MCP: nao autorizado (401).");
  if (res.status === 404) throw new Error("MCP: endpoint nao encontrado (404).");
  const ctype = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ctype.includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      if (line.startsWith("data:")) {
        try {
          return JSON.parse(line.slice(5).trim());
        } catch {
          /* ignora */
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

export async function listMcpTools(opts: { url: string; token?: string; tokenQuery?: string }): Promise<McpTool[]> {
  const session: Session = {};
  await post(opts, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "job-hunter", version: "0.1" } },
  }, session);
  await post(opts, { jsonrpc: "2.0", method: "notifications/initialized" }, session);
  const r = (await post(opts, { jsonrpc: "2.0", id: 2, method: "tools/list" }, session)) as McpResponse | null;
  return r?.result?.tools ?? [];
}

export async function callMcpTool(opts: McpCallOptions): Promise<unknown | null> {
  const session: Session = {};
  await post(opts, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "job-hunter", version: "0.1" } },
  }, session);
  await post(opts, { jsonrpc: "2.0", method: "notifications/initialized" }, session);
  const r = (await post(opts, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: opts.tool, arguments: opts.args },
  }, session)) as McpResponse | null;
  const text = r?.result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
