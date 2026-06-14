FROM node:20.16-alpine3.19

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8574

CMD ["npm", "start"]