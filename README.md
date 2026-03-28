# BaumAgent

A self-hosted AI agent portal that autonomously completes software engineering tasks on GitHub repositories. Submit a task, pick an LLM backend, and BaumAgent will clone the repo, make changes, push a branch, and open a pull request — all while streaming live logs to the UI.

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js 18+ (for building the frontend — only needed once)
- Git

### 1. Clone the repo

```bash
git clone https://github.com/Bruiserbaum/BaumAgent.git
cd BaumAgent
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your keys:

```env
ANTHROPIC_API_KEY=sk-ant-...       # Optional — leave blank if using OpenAI or Ollama only
OPENAI_API_KEY=sk-...              # Optional — leave blank if using Anthropic or Ollama only
GITHUB_TOKEN=ghp_...               # Required — needs repo + pull_request scope
GITHUB_USER_NAME=BaumAgent         # Name shown on commits
GITHUB_USER_EMAIL=you@example.com  # Email shown on commits
OLLAMA_BASE_URL=http://ollama:11434 # Change if Ollama runs elsewhere
```

Generate a GitHub token at: https://github.com/settings/tokens → Classic → check `repo`

### 3. Create data directories

```bash
mkdir -p data/db data/repos data/redis
```

### 4. Start the stack

```bash
docker compose up -d --build
```

The `--build` flag triggers the multi-stage Docker build, which compiles the React frontend automatically using Node.js inside the build container — no Node.js required on the host. This starts three containers: `baumagent-api`, `baumagent-worker`, and `baumagent-redis`.

The UI is available at `http://your-server-ip:8100`.

### 5. Verify it's running

```bash
docker compose logs -f
```

You should see `Uvicorn running on http://0.0.0.0:8000` from the api container and `Worker rq:worker` from the worker container.

---

## Updating

```bash
git pull
cd frontend && npm run build && cd ..
docker compose pull
docker compose up -d --build
```

---

## Deploying via Portainer

1. Go to **Stacks → Add stack → Repository**
2. Fill in:

| Field | Value |
|-------|-------|
| Repository URL | `https://github.com/Bruiserbaum/BaumAgent` |
| Repository reference | `refs/heads/main` |
| Compose path | `docker-compose.yml` |

3. Under **Environment variables**, add all values from `.env.example`
4. Click **Deploy the stack**

> The frontend is built automatically during the Docker image build — no Node.js needed on the Portainer host.

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

## AI Chat — Document Attachments

The AI Chat panel supports attaching documents so the AI can read and work with their contents. Click the 📎 paperclip button next to the message input to attach files.

### Supported file types

| Format | Extensions | Library |
|--------|-----------|---------|
| **PDF** | `.pdf` | PyPDF2 |
| **Word** | `.docx` | python-docx |
| **Excel** | `.xlsx`, `.xls` | openpyxl |
| **CSV** | `.csv` | Python stdlib |

### How it works

1. Click the 📎 button and select one or more files (or attach multiple files across multiple clicks).
2. Each file is uploaded to the backend, which extracts the text content and returns it.
3. Attached files appear as badges below the input area showing filename and character count.
4. When you send a message, the extracted document text is included in the prompt context so the AI can reference, analyze, or modify the content.
5. You can attach both documents and images to the same message.

> **Note:** Files up to 50 MB are supported. The extracted text is sent as part of the LLM prompt, so very large documents may consume significant token context.

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
