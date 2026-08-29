FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV REFRESH_MS=60000
ENV LEAGUE_URL=https://www.promiedos.com.ar/league/primera-c/ffjb

EXPOSE 3000

CMD ["node","server.js"]
