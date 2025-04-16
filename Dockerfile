FROM denoland/deno:2.2.9

WORKDIR /app
COPY . .
RUN deno cache server.ts
RUN deno compile --allow-net --allow-read=./frontend --output app server.ts 8080

ENTRYPOINT ["/app/app"]
