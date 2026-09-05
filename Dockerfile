# ExecFlow: analytics service + built UI in one image
FROM node:22-alpine AS ui
WORKDIR /ui
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY server/pyproject.toml server/pyproject.toml
COPY server/execflow server/execflow
RUN pip install --no-cache-dir ./server
COPY --from=ui /ui/dist ./dist
ENV EXECFLOW_DATA=/data EXECFLOW_UI_DIST=/app/dist
VOLUME ["/data"]
EXPOSE 8000
CMD ["uvicorn", "execflow.api:app", "--host", "0.0.0.0", "--port", "8000"]
