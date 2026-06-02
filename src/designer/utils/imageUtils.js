// Transforms a raw R2 URL into a Cloudflare Image Resizing URL.
// cfBase must be a Cloudflare-proxied custom domain for the R2 bucket (no trailing slash),
// e.g. 'https://assets.spattoo.com'. If cfBase is not set, returns rawUrl unchanged.
export function cfImg(rawUrl, w, h, cfBase) {
  if (!rawUrl || !cfBase) return rawUrl;
  const params = `width=${w},height=${h},quality=80,format=auto`;
  try {
    const { pathname } = new URL(rawUrl);
    return `${cfBase}/cdn-cgi/image/${params}${pathname}`;
  } catch {
    return rawUrl;
  }
}
