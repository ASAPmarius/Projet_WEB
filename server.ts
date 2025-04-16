import { Application, Router, send } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const app = new Application();
// Update the ROOT to point to the frontend directory
const ROOT = `${Deno.cwd()}/frontend/`;

app.use(async (ctx, next) => {
  try {
    await send(ctx, ctx.request.url.pathname, {
      root: ROOT,
      index: "index.html",
    });
  } catch {
    await next();
  }
});

app.use((ctx) => {
  ctx.response.status = 404;
  ctx.response.body = "404 File not found";
});

if (Deno.args.length < 1) {
  console.log(`Usage: $ deno run --allow-net --allow-read=./frontend server.ts PORT [CERT_PATH KEY_PATH]`);
  Deno.exit();
}

const options: { port: number; secure?: boolean; cert?: string; key?: string } = { port: Number(Deno.args[0]) };

if (Deno.args.length >= 3) {
  options.secure = true;
  options.cert = await Deno.readTextFile(Deno.args[1]);
  options.key = await Deno.readTextFile(Deno.args[2]);
  console.log(`SSL conf ready (use https)`);
}

console.log(`Oak static server running on port ${options.port} for the files in ${ROOT}`);
await app.listen(options);