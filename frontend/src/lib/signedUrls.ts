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

/** onUrlsAging calls refresh every SIGNED_URL_REFRESH_MS, for pages that already reload after a reconnect. */
export function onUrlsAging(refresh: () => void): () => void {
  const id = setInterval(refresh, SIGNED_URL_REFRESH_MS);
  return () => clearInterval(id);
}


/**
 * signedUntil reads when a presigned S3 link expires from its X-Amz-Date and
 * X-Amz-Expires parameters; 0 when it has neither.
 */
export function signedUntil(link: string): number {
  try {
    const q = new URL(link).searchParams;
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(q.get('X-Amz-Date') ?? '');
    const ttl = Number(q.get('X-Amz-Expires'));
    if (!m || !ttl) return 0;
    const [, y, mo, d, h, mi, se] = m.map(Number);
    return Date.UTC(y!, mo! - 1, d!, h!, mi!, se!) + ttl * 1000;
  } catch {
    return 0;
  }
}

/**
 * stillSigned reports whether a link stays valid until the next refresh
 * that pages make every SIGNED_URL_REFRESH_MS, so it can still be shown.
 */
export function stillSigned(link: string): boolean {
  return signedUntil(link) - SIGNED_URL_REFRESH_MS > Date.now();
}

function withoutQuery(link: string): string {
  return link.split('?')[0] ?? link;
}

/**
 * samePicture reports whether next is only a new signature of the picture
 * shown, unchanged since (the same stamp, such as updated_at), while the
 * shown link is still valid. Keeping the shown link then lets the browser
 * use its cached copy instead of downloading the picture again.
 */
export function samePicture(
  shown: string | undefined,
  shownStamp: string | undefined,
  next: string,
  nextStamp: string | undefined,
): boolean {
  return !!shown && shownStamp === nextStamp && withoutQuery(shown) === withoutQuery(next) && stillSigned(shown);
}
