import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

export async function startStaticServer(root, port = 0) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
      let file = join(root, relative === "/" ? "index.html" : relative);
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      response.setHeader(
        "Content-Type",
        TYPES[extname(file)] || "application/octet-stream",
      );
      response.end(await readFile(file));
    } catch {
      response.statusCode = 404;
      response.end("not found");
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
