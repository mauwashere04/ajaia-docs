FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm test && npm run build

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/ajaia.db

EXPOSE 3000
CMD ["npm", "start"]
