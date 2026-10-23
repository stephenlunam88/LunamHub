export function eventMapsUrl(
  location: string,
  device: Pick<Navigator, "userAgent">,
): string {
  const destination = encodeURIComponent(location.trim());
  // iPadOS may identify itself as a Mac when requesting desktop websites.
  const isApple = /iPhone|iPad|iPod|Macintosh/.test(device.userAgent);
  if (isApple) {
    return `https://maps.apple.com/directions?destination=${destination}`;
  }

  const webDirections = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  if (/Android/i.test(device.userAgent)) {
    // Leave the package unspecified so Android can use the preferred maps app.
    // Chrome falls back to web directions when no installed app handles geo:.
    return `intent:0,0?q=${destination}#Intent;scheme=geo;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(webDirections)};end`;
  }
  return webDirections;
}
