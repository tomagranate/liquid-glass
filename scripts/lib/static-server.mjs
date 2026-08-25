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
      const body = await readFile(file);
      response.setHeader(
        "Content-Type",
        TYPES[extname(file)] || "application/octet-stream",
      );
      response.setHeader("Accept-Ranges", "bytes");
      const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
      let output = body;
      if (range) {
        const suffix = !range[1] && range[2] ? Number(range[2]) : null;
        const start =
          suffix == null
            ? Number(range[1] || 0)
            : Math.max(0, body.length - suffix);
        const end =
          suffix == null
            ? Number(range[2] || body.length - 1)
            : body.length - 1;
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          end < start ||
          start >= body.length
        ) {
          response.statusCode = 416;
          response.setHeader("Content-Range", `bytes */${body.length}`);
          response.end();
          return;
        }
        const boundedEnd = Math.min(end, body.length - 1);
        output = body.subarray(start, boundedEnd + 1);
        response.statusCode = 206;
        response.setHeader(
          "Content-Range",
          `bytes ${start}-${boundedEnd}/${body.length}`,
        );
      }
      response.setHeader("Content-Length", output.length);
      response.end(request.method === "HEAD" ? undefined : output);
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
