FROM node:20-alpine
LABEL org.opencontainers.image.source="https://github.com/kodegiri/ai-proxy"
LABEL org.opencontainers.image.description="Universal AI Proxy — OpenAI-compatible middleware for Base44, OpenAI, Anthropic"
LABEL org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY server.js .
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "require('http').get('http://localhost:4000/health', r => process.exit(r.statusCode===200?0:1))"
CMD ["node", "server.js"]
