import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, relative, resolve } from "node:path";

const host = process.env.PLAYER_HOST ?? "0.0.0.0";
const port = Number(process.env.PLAYER_PORT ?? 4174);
const appRoot = resolve(process.cwd());
const distRoot = resolve(appRoot, "dist");
const publicRoot = resolve(appRoot, "public");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webm", "video/webm"],
  [".webp", "image/webp"]
]);

function isInside(root, filePath) {
  const relativePath = relative(root, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !resolve(filePath).includes("\0"));
}

async function sendFile(response, root, requestPath) {
  const cleanPath = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const filePath = resolve(join(root, cleanPath));

  if (!isInside(root, filePath)) {
    response.writeHead(400);
    response.end("Invalid path");
    return;
  }

  try {
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }

    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
      "Content-Length": fileStat.size,
      ...getCacheHeaders(cleanPath)
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

function getCacheHeaders(cleanPath) {
  if (cleanPath === "index.html" || cleanPath === "data/schedule.json" || cleanPath.startsWith("data/")) {
    return {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Expires: "0",
      Pragma: "no-cache"
    };
  }

  if (cleanPath.startsWith("assets/")) {
    return {
      "Cache-Control": "public, max-age=31536000, immutable"
    };
  }

  if (cleanPath.startsWith("media/")) {
    return {
      "Cache-Control": "public, max-age=3600"
    };
  }

  return {
    "Cache-Control": "no-store"
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const path = url.pathname;

  if (path === "/" || path === "/player" || path.startsWith("/player/")) {
    await sendFile(response, distRoot, "index.html");
    return;
  }

  if (path.startsWith("/assets/")) {
    await sendFile(response, distRoot, path);
    return;
  }

  if (path.startsWith("/data/") || path.startsWith("/media/")) {
    await sendFile(response, publicRoot, path);
    return;
  }

  response.writeHead(404);
  response.end("Not found");
});

server.listen(port, host, () => {
  console.log(`narrowcasting player available at http://${host}:${port}/player`);
});
