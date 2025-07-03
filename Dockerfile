FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

# Create data directory and ensure it's a volume
VOLUME /app/data

EXPOSE 3000

CMD ["npm", "start"] 