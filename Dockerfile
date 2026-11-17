# Laris in one image: the React app is built and served by the FastAPI backend, and the
# forecasting model runs with onnxruntime on CPU (no PyTorch, no GPU).
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    LARIS_DATABASE_URL=sqlite:////data/laris.db LARIS_MODEL_DIR=/app/models/larisnet \
    LARIS_STATIC_DIR=/app/frontend/dist PORT=8000
WORKDIR /app
COPY ml/ ml/
COPY backend/ backend/
RUN pip install ./ml "./backend[postgres]"
COPY models/larisnet/model.onnx models/larisnet/meta.json models/larisnet/
COPY --from=web /web/dist frontend/dist
RUN useradd --uid 10001 --create-home laris && mkdir -p /data && chown laris /data
USER 10001
VOLUME /data
EXPOSE 8000
CMD ["sh", "-c", "uvicorn laris_api.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
