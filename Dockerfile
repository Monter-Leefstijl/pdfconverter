FROM node:22-alpine AS builder

WORKDIR /app
COPY . .

RUN npm install
RUN npm run build

FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache chromium curl dumb-init libreoffice py-pip
RUN pip install unoserver --break-system-packages && apk del py-pip

COPY --from=builder /app/package.json .
COPY --from=builder /app/package-lock.json .

RUN npm install --omit=dev

COPY --from=builder /app/index.js .

USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
