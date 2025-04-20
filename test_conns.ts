import { connect } from "https://deno.land/std@0.170.0/io/util.ts";
const host = Deno.env.get("DB_HOST")!.trim();
const port = Number(Deno.env.get("DB_PORT"));
console.log("→ connecting to", JSON.stringify(host), port);
const conn = await Deno.connect({ hostname: host, port });
console.log("✅ connected!");
conn.close();
