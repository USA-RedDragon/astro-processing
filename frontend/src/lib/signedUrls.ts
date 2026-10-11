import { onReconnect } from '@/lib/events';

/** The stacker presigns preview and download URLs for an hour; pages fetch fresh ones well before then. */
export const SIGNED_URL_REFRESH_MS = 45 * 60 * 1000;

/**
 * onReconnectOrUrlsAging calls refresh after the live feed reconnects and
 * every SIGNED_URL_REFRESH_MS, so a page left open never offers expired links.
 */
export function onReconnectOrUrlsAging(refresh: () => void): () => void {
  const stop = onReconnect(refresh);
  const id = setInterval(refresh, SIGNED_URL_REFRESH_MS);
  return () => {
    stop();
    clearInterval(id);
  };
}
