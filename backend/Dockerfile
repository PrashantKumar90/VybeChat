FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 5000

# Northflank (and most PaaS) route traffic to whatever PORT they inject;
# the app already reads process.env.PORT with a 5000 fallback.
CMD ["node", "src/server.js"]
