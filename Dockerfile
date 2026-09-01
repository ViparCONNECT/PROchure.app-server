FROM node:20-alpine AS builder
WORKDIR /app
# python3/make/g++ for argon2; openssl so prisma generate detects the correct engine version
RUN apk add --no-cache python3 make g++ openssl
COPY package*.json ./
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 npm ci
COPY . .
RUN npm run prisma:generate
RUN npm run build
# Prune devDependencies so the copied node_modules stay lean
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
# openssl required by the Prisma query engine at runtime
RUN apk add --no-cache openssl
# Copy pre-compiled node_modules — avoids rebuilding native modules (argon2) again
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/main"]
