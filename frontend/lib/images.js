// Remote image hosts that `next/image` is allowed to optimise.
//
// This list is the single source of truth for the `images.remotePatterns`
// block in `next.config.mjs` and is consumed at runtime by components that
// need to decide whether a URL can safely be handed to `next/image`.
//
// Keep it explicit: a wildcard (`**`) would let any host reach the image
// optimiser and weaken its SSRF protection. Add a hostname here only when
// the app actually serves badge images from it.
export const ALLOWED_IMAGE_HOSTS = [
  "ipfs.io",
  "gateway.pinata.cloud",
  "cloudflare-ipfs.com",
  "nftstorage.link",
  "raw.githubusercontent.com",
];

/**
 * Returns true when `src` can be passed to `next/image`.
 *
 * Local (absolute-path) assets are always allowed. Remote URLs are only
 * allowed when they use https and their hostname is in
 * {@link ALLOWED_IMAGE_HOSTS}. Everything else should be rendered with a
 * plain `<img>` so an unexpected host never becomes a render-time error.
 *
 * @param {string|undefined|null} src
 * @returns {boolean}
 */
export function isOptimisableImageSrc(src) {
  if (!src || typeof src !== "string") return false;
  if (src.startsWith("/")) return true;

  try {
    const url = new URL(src);
    return (
      url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export default isOptimisableImageSrc;
