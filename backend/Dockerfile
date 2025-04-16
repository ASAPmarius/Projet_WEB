FROM denoland/deno:2.2.9

WORKDIR /app
COPY back_server.ts .
COPY deno.json .
RUN deno cache back_server.ts
RUN deno compile --allow-env --allow-write --allow-ffi --allow-read --allow-net --no-check --output app back_server.ts

ENTRYPOINT ["/app/app"]

 
