# A placeholder app. Replace it with this project's build.
FROM node:22-alpine
WORKDIR /app
COPY server.js .
# A number, because runAsNonRoot can't verify a user name.
USER 1000
EXPOSE 8080
CMD ["node", "server.js"]
