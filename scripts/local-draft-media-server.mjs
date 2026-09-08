// Serveur de médias réservé au laboratoire local QuartzReport.
// Il n'est jamais inclus dans le site public et n'envoie rien à GitHub.
import { createServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.QUARTZ_DRAFT_MEDIA_PORT || 8788);
const root = join(process.cwd(), ".local-draft-media");
const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function cors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function safeName(value) {
  return /^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(value) ? value : null;
}

createServer(async (request, response) => {
  cors(response);
  if (request.method === "OPTIONS") return response.end();
  const name = safeName(new URL(request.url, `http://${request.headers.host}`).pathname.replace(/^\/images\//, ""));
  if (!name) { response.writeHead(404); return response.end(); }
  const file = join(root, normalize(name));
  if (!file.startsWith(root)) { response.writeHead(400); return response.end(); }
  try {
    if (request.method === "GET") {
      const bytes = await readFile(file);
      response.writeHead(200, { "Content-Type": types[extname(name)] || "application/octet-stream", "Cache-Control": "no-store" });
      return response.end(bytes);
    }
    if (request.method === "PUT") {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 24 * 1024 * 1024) throw new Error("Image trop lourde"); chunks.push(chunk); }
      await mkdir(root, { recursive: true });
      await writeFile(file, Buffer.concat(chunks));
      response.writeHead(201, { "Content-Type": "application/json" });
      return response.end(JSON.stringify({ ok: true, path: `/images/${name}` }));
    }
    if (request.method === "DELETE") {
      await rm(file, { force: true });
      response.writeHead(204);
      return response.end();
    }
    response.writeHead(405); response.end();
  } catch (error) {
    const status = error.message === "Image trop lourde" ? 413 : error.code === "ENOENT" ? 404 : 500;
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error.message || "Erreur média locale" }));
  }
}).listen(port, "0.0.0.0", () => console.log(`Médias brouillons locaux : http://0.0.0.0:${port}`));
