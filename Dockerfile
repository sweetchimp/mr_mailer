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
COPY --from=build /app/.next/standalone ./.next/standalone
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Worker entrypoint (runs with tsx, a runtime dep in this image)
COPY src ./src
COPY tsconfig.json ./tsconfig.json

EXPOSE 3000
ENV PORT=3000
# The standalone server binds to HOSTNAME, and Docker sets that variable to the
# container's own hostname by default. Left alone it binds loopback *inside* the
# container, so the published port maps to nothing and the app appears to hang
# with no error in the logs. 0.0.0.0 is required to be reachable from the host.
ENV HOSTNAME=0.0.0.0

# Default: run the web server via the same `start` script as everywhere else, so
# there is one definition of how the standalone server is launched.
#   docker run mr-mailer npm run worker   (worker instead)
CMD ["npm", "start"]