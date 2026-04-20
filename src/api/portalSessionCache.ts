import { normalizeListenerBaseUrl, normalizePortal } from '../auth/lmCredentials.js';

export interface PortalSessionCacheEntry {
  portalName: string;
  jSessionId: string;
  csrfToken: string;
  domain: string;
}

export interface PortalSessionCachePayload {
  portalName: string;
  jSessionId: string;
  csrfToken: string;
  domain: string;
}

interface CachedPortalSession extends PortalSessionCacheEntry {
  fetchedAt: number;
}

const portalSessionCache = new Map<string, CachedPortalSession>();

function buildCacheKey(listenerBaseUrl: string, portalName: string): string {
  return `${normalizeListenerBaseUrl(listenerBaseUrl)}::${normalizePortal(portalName)}`;
}

export function getCachedPortalSession(
  listenerBaseUrl: string,
  portalName: string
): PortalSessionCacheEntry | undefined {
  const cachedSession = portalSessionCache.get(buildCacheKey(listenerBaseUrl, portalName));
  if (!cachedSession) {
    return undefined;
  }

  return {
    portalName: cachedSession.portalName,
    jSessionId: cachedSession.jSessionId,
    csrfToken: cachedSession.csrfToken,
    domain: cachedSession.domain,
  };
}

export function cachePortalSession(
  listenerBaseUrl: string,
  session: PortalSessionCachePayload
): PortalSessionCacheEntry {
  const entry: CachedPortalSession = {
    portalName: normalizePortal(session.portalName),
    jSessionId: session.jSessionId,
    csrfToken: session.csrfToken,
    domain: session.domain,
    fetchedAt: Date.now(),
  };

  portalSessionCache.set(buildCacheKey(listenerBaseUrl, entry.portalName), entry);
  return {
    portalName: entry.portalName,
    jSessionId: entry.jSessionId,
    csrfToken: entry.csrfToken,
    domain: entry.domain,
  };
}

export function invalidateCachedPortalSession(
  listenerBaseUrl: string,
  portalName: string
): boolean {
  return portalSessionCache.delete(buildCacheKey(listenerBaseUrl, portalName));
}
