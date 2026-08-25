function countFrom(id) {
  if (id === "content-small-motion") return 3;
  if (id === "mixed") return 8;
  return Number(id.match(/-(1|8|32)$/)?.[1] ?? (id === "media-live-8" ? 8 : 1));
}

export function expectedBackend(
  id,
  userAgent,
  { mediaWebglAvailable = true } = {},
) {
  if (id === "idle-teardown") return ["backdrop", "background-copy", "none"];
  if (id.startsWith("background-copy")) {
    const denseWebKit =
      /AppleWebKit\//.test(userAgent) &&
      !/(?:Chrome|Chromium|Edg)\//.test(userAgent) &&
      countFrom(id) > 1;
    return denseWebKit ? ["native"] : ["background-copy"];
  }
  if (id.startsWith("media-live"))
    return mediaWebglAvailable ? ["media-webgl"] : ["none"];
  if (id.startsWith("content-page")) return ["content-svg", "native"];
  if (id.startsWith("content-") || id === "mixed")
    return ["content-svg", "media-webgl", "background-copy", "native"];
  if (id.startsWith("backdrop") && /(?:Chrome|Chromium)\//.test(userAgent))
    return ["backdrop"];
  return ["content-svg", "background-copy", "native"];
}
