FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:26-alpine AS runtime
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY package*.json ./
# Package managers are needed during installation, not while serving the app.
# Remove their bundled dependencies from the final runtime image.
RUN npm ci --omit=dev && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=build /app/dist ./dist
COPY server ./server
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
