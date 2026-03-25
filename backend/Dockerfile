FROM python:3.12-slim

# Install git (required by gitpython)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create data dirs
RUN mkdir -p /app/data/db /app/repos /app/static

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
