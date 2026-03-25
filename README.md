# BaumAgent

A self-hosted AI agent portal that autonomously completes software engineering tasks on GitHub repositories. Submit a task, pick an LLM backend, and BaumAgent will clone the repo, make changes, push a branch, and open a pull request — all while streaming live logs to the UI.

---

## Quick Start

```bash
git clone https://github.com/youruser/BaumAgent
cd BaumAgent
cp .env.example .env
# Fill in your keys in .env
```

Build the frontend:
```bash
cd frontend
npm install
npm run build
cd ..
```

Start everything:
```bash
docker compose up -d
```

The UI is available at `http://localhost:8100`.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | _(empty)_ | Anthropic API key |
| `OPENAI_API_KEY` | _(empty)_ | OpenAI API key |
| `GITHUB_TOKEN` | **required** | GitHub personal access token with `repo` scope |
| `GITHUB_USER_NAME` | `BaumAgent` | Git commit author name |
| `GITHUB_USER_EMAIL` | `baumagent@localhost` | Git commit author email |
| `OLLAMA_BASE_URL` | `http://ollama:11434` | Ollama API base URL |
| `DATABASE_URL` | `sqlite:////app/data/baumAgent.db` | SQLAlchemy database URL |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection URL |

---

## Supported LLM Backends

| Backend | Models |
|---|---|
| **Anthropic** | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001 |
| **OpenAI** | gpt-4o, gpt-4o-mini, o1, o3-mini |
| **Ollama** | Any model loaded in your Ollama instance (fetched live) |

---

## Connecting to Existing Ollama in BaumDocker

If you run Ollama as part of your homelab stack on a shared Docker network (e.g. `ai_backend`), set `OLLAMA_BASE_URL` to `http://ollama:11434` and add BaumAgent to that network:

```yaml
# In docker-compose.yml, under networks:
networks:
  baumagent:
    name: baumagent
  ai_backend:
    external: true

# And add to the api and worker services:
    networks:
      - baumagent
      - ai_backend
```

---

## Authentik Forward Auth (NPM + Authentik)

BaumAgent does not implement authentication itself — protect it with Nginx Proxy Manager and Authentik forward auth as a single application proxy, the same pattern used for other homelab services. No changes to BaumAgent are required:

1. In Authentik, create a **Proxy Provider** (Forward Auth Single Application) for `http://baumagent.yourdomain.com`.
2. Create an **Application** pointing to that provider.
3. In NPM, add a proxy host for `baumagent.yourdomain.com` → `baumagent-api:8000`, then add the Authentik forward auth advanced config snippet to the proxy host.

All requests will be gated by Authentik before reaching BaumAgent.

---

## Agent Tools

The agent has access to: `list_dir`, `read_file`, `write_file`, `delete_file`, `web_search` (DuckDuckGo), and `finish`.
