import { jest } from '@jest/globals';
import {
  cachePortalSession,
  getCachedPortalSession,
  invalidateCachedPortalSession,
} from '../../../src/api/portalSessionCache.js';

describe('portalSessionCache', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('caches sessions by listener base URL and portal', () => {
    const cached = cachePortalSession('http://127.0.0.1:8072/', {
      portalName: 'prod',
      jSessionId: 'js-prod',
      csrfToken: 'csrf-prod',
      domain: 'portal.logicmonitor.com',
    });

    expect(cached).toEqual({
      portalName: 'prod',
      jSessionId: 'js-prod',
      csrfToken: 'csrf-prod',
      domain: 'portal.logicmonitor.com',
    });

    expect(getCachedPortalSession('http://127.0.0.1:8072', 'prod')).toEqual(cached);
  });

  it('keeps separate cache entries per portal', () => {
    cachePortalSession('http://127.0.0.1:8072', {
      portalName: 'prod',
      jSessionId: 'js-prod',
      csrfToken: 'csrf-prod',
      domain: 'portal.logicmonitor.com',
    });

    cachePortalSession('http://127.0.0.1:8072', {
      portalName: 'gov',
      jSessionId: 'js-gov',
      csrfToken: 'csrf-gov',
      domain: 'secure.lmgov.us',
    });

    expect(getCachedPortalSession('http://127.0.0.1:8072', 'prod')).toMatchObject({
      portalName: 'prod',
      jSessionId: 'js-prod',
    });
    expect(getCachedPortalSession('http://127.0.0.1:8072', 'gov')).toMatchObject({
      portalName: 'gov',
      jSessionId: 'js-gov',
    });
  });

  it('invalidates a cached portal session explicitly', () => {
    cachePortalSession('http://127.0.0.1:8072', {
      portalName: 'prod',
      jSessionId: 'js-prod',
      csrfToken: 'csrf-prod',
      domain: 'portal.logicmonitor.com',
    });

    expect(invalidateCachedPortalSession('http://127.0.0.1:8072', 'prod')).toBe(true);
    expect(getCachedPortalSession('http://127.0.0.1:8072', 'prod')).toBeUndefined();
  });
});
