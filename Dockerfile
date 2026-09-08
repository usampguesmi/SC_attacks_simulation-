# YU-SAM Power — always-on web UI
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app ./app
COPY data ./data-seed
COPY database ./database

ENV NODE_ENV=production
ENV ANALYZE_UI_HOST=0.0.0.0
ENV PUBLIC_MODE=true
ENV PUBLIC_AI=false
ENV PORT=3857
ENV YU_SAM_DATA_DIR=/data

EXPOSE 3857

CMD ["node", "app/startProduction.js"]
