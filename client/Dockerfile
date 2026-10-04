# ============================================================================
# MMU FleetRadar 3D — frontend image
# Build context is the REPO ROOT:
#   docker build -f client/Dockerfile -t mmu-client .
# Builds the Vite SPA and serves it via nginx (which also proxies /api and /ws
# to the backend so the deployment is single-origin).
# ============================================================================

# ---- build stage -----------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
# Single-origin deployment: the SPA targets the host it was served from, and
# nginx below proxies /api + /ws to the backend service.
ARG VITE_SAME_ORIGIN=true
ENV VITE_SAME_ORIGIN=$VITE_SAME_ORIGIN
RUN npm run build

# ---- runtime stage ---------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
