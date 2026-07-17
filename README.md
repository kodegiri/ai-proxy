# Universal AI Proxy

OpenAI-compatible middleware untuk Base44, OpenAI, Anthropic, dan custom provider.

## Quick Start

```bash
docker run -d \
  -p 4000:4000 \
  -e BASE44_AGENT_ID=your_agent_id \
  -e BASE44_API_KEY=your_api_key \
  ghcr.io/GITHUB_USERNAME/ai-proxy:latest
```

## Environment Variables

| Variable | Keterangan |
|---|---|
| `BASE44_AGENT_ID` | Agent ID dari Base44 |
| `BASE44_API_KEY` | API key Base44 |
| `OPENAI_API_KEY` | API key OpenAI (opsional) |
| `OPENAI_BASE_URL` | Base URL OpenAI, default: https://api.openai.com/v1 |
| `ANTHROPIC_API_KEY` | API key Anthropic (opsional) |
| `CUSTOM_API_KEY` | API key custom provider (opsional) |
| `CUSTOM_BASE_URL` | Base URL custom provider (opsional) |
| `CUSTOM_PROVIDER_NAME` | Nama custom provider (opsional) |
| `PORT` | Port server, default: 4000 |

## Endpoints

- `GET /health` — status proxy & provider aktif
- `GET /v1/models` — list model tersedia
- `POST /v1/chat/completions` — chat endpoint (OpenAI-compatible)

## Model Selector

| Model ID | Provider |
|---|---|
| `base44-{agentId}` | Base44 |
| `gpt-4o`, `gpt-4o-mini` | OpenAI |
| `claude-sonnet-4-6` | Anthropic |
| `custom/default` | Custom provider |
