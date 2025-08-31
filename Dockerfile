FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Ensure dirs exist and set ownership using stable names
RUN mkdir -p /app/data /app/public/Assets \
  && chown -R node:node /app/data /app/public/Assets

USER 1000

# Create data directory and ensure it's a volume
VOLUME /app/data

EXPOSE 3000

CMD ["npm", "start"]
