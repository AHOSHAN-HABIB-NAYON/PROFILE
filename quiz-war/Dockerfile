# QUIZ WAR API (REST + Socket.IO). Web and admin are static builds served by nginx/CDN.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
RUN npm ci
COPY . .
RUN npm run build -w @quizwar/server

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
RUN npm ci --omit=dev -w @quizwar/server --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY database ./database
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
WORKDIR /app/apps/server
ENV STORAGE_LOCAL_DIR=/app/uploads PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
