# ============================================================================
# MMU FleetRadar 3D — backend image
# Build context is the REPO ROOT (needs ../assets/branding):
#   docker build -f server/Dockerfile -t mmu-server .
# Multi-stage: compile TypeScript, then run on a slim image as a non-root user.
# ============================================================================

# ---- build stage -----------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ---- runtime stage ---------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app/server
ENV NODE_ENV=production

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/server/dist ./dist
# The server resolves branding assets at ../../assets/branding from dist.
COPY assets /app/assets

# Files copied from the build stage are root-owned; hand them to the runtime user.
RUN chown -R node:node /app

USER node

EXPOSE 4000
CMD ["node", "dist/index.js"]
