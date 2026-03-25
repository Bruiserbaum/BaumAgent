# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Python API
FROM python:3.12-slim

# Install git (required by gitpython)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Copy built frontend from stage 1
COPY --from=frontend-builder /frontend/dist /app/static

# Create runtime data dirs
RUN mkdir -p /app/data /app/repos

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
