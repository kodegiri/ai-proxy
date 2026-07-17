/**
 * Universal AI Proxy — OpenAI-compatible middleware
 * Supports: Base44, OpenAI, Anthropic, custom providers
 * Push to ghcr.io and configure via environment variables
 */

const http  = require("http");
const https = require("https");

const PORT = process.env.PORT || 4000;

// ── Provider config dari environment ──────────────────────────
const PROVIDERS = {};

// Base44
if (process.env.BASE44_API_KEY) {
  PROVIDERS["base44"] = {
    type      : "base44",
    agentId   : process.env.BASE44_AGENT_ID || "",
    apiKey    : process.env.BASE44_API_KEY,
    baseUrl   : `https://app.base44.com/api/agents/${process.env.BASE44_AGENT_ID || ""}`,
  };
}

// OpenAI passthrough
if (process.env.OPENAI_API_KEY) {
  PROVIDERS["openai"] = {
    type   : "openai",
    apiKey : process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  };
}

// Anthropic passthrough
if (process.env.ANTHROPIC_API_KEY) {
  PROVIDERS["anthropic"] = {
    type   : "anthropic",
    apiKey : process.env.ANTHROPIC_API_KEY,
    baseUrl: "https://api.anthropic.com",
  };
}

// Custom OpenAI-compatible provider
if (process.env.CUSTOM_API_KEY && process.env.CUSTOM_BASE_URL) {
  PROVIDERS["custom"] = {
    type   : "openai",
    apiKey : process.env.CUSTOM_API_KEY,
    baseUrl: process.env.CUSTOM_BASE_URL,
    name   : process.env.CUSTOM_PROVIDER_NAME || "custom",
  };
}

// ── HTTP helper ───────────────────────────────────────────────
function req(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u    = new URL(url);
    const opts = {
      hostname: u.hostname,
      path    : u.pathname + u.search,
      method,
      headers : { "Content-Type": "application/json", ...headers },
    };
    const r = https.request(opts, res => {
      let data = "";
      res.on("data", c => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// ── Provider handlers ─────────────────────────────────────────

async function handleBase44(provider, messages) {
  const conv = await req("POST", `${provider.baseUrl}/conversations`,
    { "api_key": provider.apiKey }, {});
  if (!conv.body?.id) throw new Error("Base44: gagal buat conversation");
  const convId = conv.body.id;

  const lastUser = [...messages].reverse().find(m => m.role === "user");
  if (!lastUser) throw new Error("Tidak ada user message");

  const msgRes = await req(
    "POST",
    `${provider.baseUrl}/conversations/${convId}/messages`,
    { "api_key": provider.apiKey },
    { role: "user", content: lastUser.content, file_urls: [] }
  );

  let reply = msgRes.body?.content || msgRes.body?.message?.content;
  if (!reply) {
    const detail = await req("GET",
      `${provider.baseUrl}/conversations/${convId}`,
      { "api_key": provider.apiKey });
    const msgs = detail.body?.messages || [];
    reply = [...msgs].reverse().find(m => m.role === "assistant")?.content || "";
  }
  return reply;
}

async function handleOpenAI(provider, messages, model) {
  const res = await req(
    "POST",
    `${provider.baseUrl}/chat/completions`,
    { "Authorization": `Bearer ${provider.apiKey}` },
    { model: model || "gpt-4o-mini", messages, stream: false }
  );
  if (res.body?.choices?.[0]?.message?.content) {
    return res.body.choices[0].message.content;
  }
  throw new Error("OpenAI: unexpected response — " + JSON.stringify(res.body));
}

async function handleAnthropic(provider, messages, model) {
  const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n");
  const userMsgs = messages.filter(m => m.role !== "system");
  const res = await req(
    "POST",
    `${provider.baseUrl}/v1/messages`,
    {
      "x-api-key"         : provider.apiKey,
      "anthropic-version" : "2023-06-01",
    },
    {
      model   : model || "claude-3-5-haiku-20241022",
      max_tokens: 4096,
      system  : system || undefined,
      messages: userMsgs,
    }
  );
  if (res.body?.content?.[0]?.text) {
    return res.body.content[0].text;
  }
  throw new Error("Anthropic: unexpected response — " + JSON.stringify(res.body));
}

// ── Route chat request ke provider yang tepat ─────────────────
async function routeChat(modelId, messages) {
  // Model format: "provider/model-name" atau "base44-agentId"
  let providerKey = "base44"; // default
  let modelName   = modelId;

  if (modelId.includes("/")) {
    const parts = modelId.split("/");
    providerKey = parts[0];
    modelName   = parts.slice(1).join("/");
  } else if (modelId.startsWith("base44-")) {
    providerKey = "base44";
  } else if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) {
    providerKey = "openai";
    modelName   = modelId;
  } else if (modelId.startsWith("claude-")) {
    providerKey = "anthropic";
    modelName   = modelId;
  }

  const provider = PROVIDERS[providerKey];
  if (!provider) throw new Error(`Provider "${providerKey}" tidak dikonfigurasi. Cek environment variables.`);

  switch (provider.type) {
    case "base44"  : return handleBase44(provider, messages);
    case "openai"  : return handleOpenAI(provider, messages, modelName);
    case "anthropic": return handleAnthropic(provider, messages, modelName);
    default        : throw new Error(`Unknown provider type: ${provider.type}`);
  }
}

// ── Build model list dari provider yang aktif ─────────────────
function getModels() {
  const models = [];
  const ts = Math.floor(Date.now() / 1000);

  if (PROVIDERS.base44) {
    models.push({
      id        : `base44-${PROVIDERS.base44.agentId}`,
      object    : "model", created: ts, owned_by: "base44",
      name      : `Base44 Agent (${PROVIDERS.base44.agentId.slice(-8)})`,
    });
  }
  if (PROVIDERS.openai) {
    ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"].forEach(id => {
      models.push({ id, object: "model", created: ts, owned_by: "openai" });
    });
  }
  if (PROVIDERS.anthropic) {
    ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"].forEach(id => {
      models.push({ id, object: "model", created: ts, owned_by: "anthropic" });
    });
  }
  if (PROVIDERS.custom) {
    models.push({
      id      : `${PROVIDERS.custom.name || "custom"}/default`,
      object  : "model", created: ts, owned_by: PROVIDERS.custom.name || "custom",
    });
  }
  return models;
}

// ── HTTP Server ───────────────────────────────────────────────
const server = http.createServer(async (request, response) => {
  const { url, method } = request;

  // CORS
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (method === "OPTIONS") { response.writeHead(200); response.end(); return; }

  const json = (status, data) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(data));
  };

  // Health
  if ((url === "/" || url === "/health") && method === "GET") {
    return json(200, {
      status   : "ok",
      version  : "1.0.0",
      providers: Object.keys(PROVIDERS),
      models   : getModels().length,
    });
  }

  // Models list
  if (url === "/v1/models" && method === "GET") {
    return json(200, { object: "list", data: getModels() });
  }

  // Chat completions
  if (url === "/v1/chat/completions" && method === "POST") {
    let body = "";
    request.on("data", c => (body += c));
    request.on("end", async () => {
      try {
        const payload  = JSON.parse(body);
        const messages = payload.messages || [];
        const model    = payload.model || "base44";
        const stream   = payload.stream || false;
        const id       = "chatcmpl-" + Date.now();
        const ts       = Math.floor(Date.now() / 1000);

        const reply = await routeChat(model, messages);

        if (stream) {
          response.writeHead(200, {
            "Content-Type" : "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection"   : "keep-alive",
          });
          const words = reply.split(" ");
          for (let i = 0; i < words.length; i++) {
            const chunk = {
              id, object: "chat.completion.chunk", created: ts, model,
              choices: [{ index: 0, delta: { content: (i === 0 ? "" : " ") + words[i] }, finish_reason: null }]
            };
            response.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
          response.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: ts, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
          response.write("data: [DONE]\n\n");
          response.end();
        } else {
          json(200, {
            id, object: "chat.completion", created: ts, model,
            choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
          });
        }
      } catch (e) {
        console.error("[ERROR]", e.message);
        json(500, { error: { message: e.message, type: "server_error" } });
      }
    });
    return;
  }

  json(404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Universal AI Proxy v1.0.0`);
  console.log(`   Port     : ${PORT}`);
  console.log(`   Providers: ${Object.keys(PROVIDERS).join(", ") || "none — cek env vars!"}`);
  console.log(`   Models   : ${getModels().length}`);
  console.log(`   Health   : http://localhost:${PORT}/health\n`);
});
