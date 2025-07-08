FROM node:22-alpine

WORKDIR /app

# copy package.json
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/ws-backend/package.json apps/ws-backend/
COPY packages/ packages/

RUN npm install -g pnpm
RUN pnpm install

# copy main files
COPY apps/ws-backend apps/ws-backend/

# Build your backend
RUN pnpm run buildscript

EXPOSE 8080

# CMD [ "pnpm","run","start" ]
CMD [ "pnpm", "run", "docker:ws"]