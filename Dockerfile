FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache curl unzip
COPY package.json ./
RUN npm install
COPY . ./
RUN curl -L -o xray.zip https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip && unzip -o xray.zip xray -d /app && chmod +x /app/xray && rm -f xray.zip config.json
EXPOSE 8080
CMD ["node", "server.js"]
