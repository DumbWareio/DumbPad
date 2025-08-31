FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# 1000 is default node user from base image
RUN mkdir -p /app/data && chown -R 1000:1000 /app/data && chown -R 1000:1000 /app/public/Assets

USER 1000

# Create data directory and ensure it's a volume
VOLUME /app/data

EXPOSE 3000

CMD ["npm", "start"]
