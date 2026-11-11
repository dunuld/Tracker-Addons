# Home-Assistant-Addon "ING Depot"
# Der Supervisor übergibt BUILD_FROM; wir nutzen bewusst node:24-alpine (multi-arch: amd64, aarch64).

# ---- Build: Angular-Frontend + TypeScript-Server ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:all

# ---- Runtime ----
FROM node:24-alpine
ENV NODE_ENV=production \
    ADDON_MODE=1 \
    DATA_DIR=/data \
    PORT=8099
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force
COPY --from=build /app/dist ./dist

EXPOSE 8099
CMD ["node", "dist/server/server/src/main.js"]

LABEL io.hass.name="ING Depot" \
      io.hass.description="Depotübersicht aus ING-PDFs" \
      io.hass.type="addon" \
      io.hass.arch="amd64|aarch64"
