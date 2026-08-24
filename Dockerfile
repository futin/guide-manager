# Dev image shared by both Node processes (Nest API and Vite). It carries only
# the dependency install: the source arrives at run time through a bind mount so
# --watch stays useful, and there is nothing to rebuild for a code change.
#
# node_modules lives in the image rather than in the bind mount because the
# host's copy is built for macOS — mounting it over /app would hand the
# container the wrong binaries for esbuild and friends. Compose masks
# /app/node_modules with a named volume, which Docker seeds from this layer.
FROM node:20-slim

WORKDIR /app

# Copied on their own so editing source does not invalidate the install layer.
COPY package.json package-lock.json ./
RUN npm ci
