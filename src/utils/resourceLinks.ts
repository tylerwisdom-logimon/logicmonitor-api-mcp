/**
 * LogicMonitor portal URL builders for resource links.
 */

export interface DashboardLinkArgs {
  company: string;
  dashboardId: number | string;
  groupIds?: Array<number | string | null | undefined>;
}

export interface DeviceLinkArgs {
  company: string;
  deviceId: number | string;
}

export interface WebsiteLinkArgs {
  company: string;
  websiteId: number | string;
}

export interface AlertLinkArgs {
  company: string;
  alertId: number | string;
}

function normalizeCompany(company: string | undefined): string {
  if (!company || !company.trim()) {
    throw new Error('LogicMonitor company subdomain is required to build URLs.');
  }
  return company.trim().toLowerCase();
}

function ensureId(id: number | string | undefined, label: string): string {
  if (id === null || typeof id === 'undefined' || `${id}`.trim().length === 0) {
    throw new Error(`${label} is required to build URLs.`);
  }
  return `${id}`.trim();
}

function baseUrl(company: string): string {
  return `https://${normalizeCompany(company)}.logicmonitor.com/santaba/uiv4`;
}

export function getDashboardLink(args: DashboardLinkArgs): string {
  const dashboardId = ensureId(args.dashboardId, 'dashboardId');
  const groupSegments = (args.groupIds ?? [])
    .filter((v): v is number | string => v != null)
    .map(v => `dashboardGroups-${v}`);
  const segments = [...groupSegments, `dashboards-${dashboardId}`];
  return `${baseUrl(args.company)}/dashboards/${segments.join(',')}`;
}

export function getDeviceLink(args: DeviceLinkArgs): string {
  const deviceId = ensureId(args.deviceId, 'deviceId');
  return `${baseUrl(args.company)}/resources/treeNodes/t-d,id-${encodeURIComponent(deviceId)}?source=details&tab=info`;
}

export function getWebsiteLink(args: WebsiteLinkArgs): string {
  const websiteId = ensureId(args.websiteId, 'websiteId');
  return `${baseUrl(args.company)}/websites/treeNodes/t-s,id-${encodeURIComponent(websiteId)}?source=details&tab=info`;
}

export function getAlertLink(args: AlertLinkArgs): string {
  const alertId = ensureId(args.alertId, 'alertId');
  return `${baseUrl(args.company)}/alerts/${alertId}`;
}
