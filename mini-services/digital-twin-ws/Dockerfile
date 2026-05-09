FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install -g bun && bun install
COPY . .
USER node
EXPOSE 3003
CMD ["bun", "run", "start"]
