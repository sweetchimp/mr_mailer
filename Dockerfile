FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma/schema.prisma prisma/schema.prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
# Prisma client + engine (generated in build stage)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY prisma ./prisma
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Worker entrypoint (runs with tsx, a runtime dep in this image)
COPY src ./src
COPY tsconfig.json ./tsconfig.json

EXPOSE 3000
ENV PORT=3000

# Default: run the web server. Override CMD to run the worker:
#   docker run mr-mailer npm run worker
CMD ["node", "server.js"]