FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma/schema.prisma prisma/schema.prisma
COPY prisma.config.ts prisma.config.ts
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/generated/prisma ./generated/prisma
COPY --from=build /app/build ./build

# Default: run web server. Override CMD to run worker.
# Web server: docker run mr-mailer
# Worker: docker run mr-mailer npm run worker
CMD ["npm", "run", "start"]
