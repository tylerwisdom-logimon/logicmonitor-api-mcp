/**
 * MCP Prompts for LogicMonitor workflows
 */

import { Prompt } from '@modelcontextprotocol/sdk/types.js';

/**
 * Export Device Metrics Prompt
 * Guides through the process of exporting metric data from LogicMonitor devices
 */
export const exportDeviceMetricsPrompt: Prompt = {
  name: 'export-device-metrics',
  description: 'Guide through exporting metric data from LogicMonitor devices. This workflow helps you retrieve monitoring data by walking through device selection, datasource discovery, instance enumeration, and metric data retrieval.',
  arguments: [
    {
      name: 'device_identifier',
      description: 'Device ID, name, or filter to identify device(s). Examples: device ID "123", name filter "displayName:*prod*", or "all production servers"',
      required: true
    },
    {
      name: 'datasource_filter',
      description: 'Optional wildcard filter for datasources (e.g., "CPU*", "*Memory*", "Disk*"). Leave empty to include all datasources.',
      required: false
    },
    {
      name: 'time_range_hours',
      description: 'Hours of historical data to retrieve. Defaults to 24 hours if not specified.',
      required: false
    }
  ]
};

/**
 * Batch Device Update Prompt
 * Guides through listing, reviewing, and batch-updating devices
 */
export const batchDeviceUpdatePrompt: Prompt = {
  name: 'batch-device-update',
  description: 'Guide through batch updating LogicMonitor devices. This workflow helps you find devices by filter, review them, and apply updates in bulk using session-based batch operations.',
  arguments: [
    {
      name: 'device_filter',
      description: 'Filter to select devices. Examples: "displayName:*prod*", "hostStatus:dead", "hostGroupIds:42"',
      required: true
    },
    {
      name: 'update_description',
      description: 'Description of what to update. Examples: "disable alerting", "add custom property env=production", "move to group 15"',
      required: true
    }
  ]
};

/**
 * Alert Triage Prompt
 * Guides through listing, filtering, and acknowledging alerts
 */
export const alertTriagePrompt: Prompt = {
  name: 'alert-triage',
  description: 'Guide through triaging LogicMonitor alerts. This workflow helps you list active alerts, filter by severity or resource, review details, and acknowledge or add notes in bulk.',
  arguments: [
    {
      name: 'severity_filter',
      description: 'Alert severity to focus on. Options: "critical", "error", "warning", or "all". Defaults to "all".',
      required: false
    },
    {
      name: 'resource_filter',
      description: 'Optional filter to scope alerts to specific resources. Examples: "resourceTemplateName:CPU*", "monitorObjectName:*prod*"',
      required: false
    }
  ]
};

/**
 * Collector Health Check Prompt
 * Guides through checking collector status and group balance
 */
export const collectorHealthCheckPrompt: Prompt = {
  name: 'collector-health-check',
  description: 'Guide through checking LogicMonitor collector status. This workflow helps you list collectors, identify down or degraded collectors, review collector group assignments, and assess load balance.',
  arguments: [
    {
      name: 'collector_filter',
      description: 'Optional filter for collectors. Examples: "status:down", "description:*prod*". Leave empty to review all collectors.',
      required: false
    },
    {
      name: 'include_groups',
      description: 'Set to "true" to also review collector group assignments and auto-balance settings. Defaults to "false".',
      required: false
    }
  ]
};

/**
 * User Audit Prompt
 * Guides through listing users, reviewing roles, and identifying stale accounts
 */
export const userAuditPrompt: Prompt = {
  name: 'user-audit',
  description: 'Guide through auditing LogicMonitor user accounts. This workflow helps you list users, review role assignments, identify inactive or API-only accounts, and clean up stale users.',
  arguments: [
    {
      name: 'role_filter',
      description: 'Optional filter to scope by role. Examples: "roles.name:administrator", "status:suspended". Leave empty to review all users.',
      required: false
    },
    {
      name: 'include_api_users',
      description: 'Set to "true" to include API-only user accounts. Defaults to "true".',
      required: false
    }
  ]
};

/**
 * Dashboard Clone Prompt
 * Guides through finding a dashboard, reviewing its config, and creating a copy
 */
export const dashboardClonePrompt: Prompt = {
  name: 'dashboard-clone',
  description: 'Guide through cloning a LogicMonitor dashboard. This workflow helps you find an existing dashboard, review its configuration, and create a modified copy in a target group.',
  arguments: [
    {
      name: 'source_dashboard',
      description: 'Dashboard ID or name filter to identify the source dashboard. Examples: "123", "name:*Production Overview*"',
      required: true
    },
    {
      name: 'target_name',
      description: 'Name for the cloned dashboard. Example: "Staging Overview"',
      required: true
    },
    {
      name: 'target_group',
      description: 'Optional dashboard group ID for the clone. Leave empty to place in the same group as the source.',
      required: false
    }
  ]
};

/**
 * Get prompt content with instructions
 */
export function getPromptContent(promptName: string, args: Record<string, string>): string {
  if (promptName === 'batch-device-update') {
    const deviceFilter = args.device_filter || 'displayName:*';
    const updateDescription = args.update_description || 'the specified updates';

    return `# Batch Device Update Workflow

You are helping to batch update LogicMonitor devices matching: ${deviceFilter}
Update to apply: ${updateDescription}

## Workflow Steps:

### Step 1: Find Matching Devices
List devices matching the filter:
\`\`\`json
{
  "operation": "list",
  "filter": "${deviceFilter}",
  "fields": "id,displayName,hostStatus,disableAlerting",
  "size": 50
}
\`\`\`

This stores results in session variables \`lastDeviceList\` and \`lastDeviceListIds\`.

### Step 2: Review Devices
Present the matched devices to the user for confirmation:
- Show device names, IDs, and current status
- Confirm the count matches expectations
- If too many results, suggest a more specific filter

### Step 3: Apply Batch Update
Use applyToPrevious with the session variable to update all matched devices:
\`\`\`json
{
  "operation": "update",
  "applyToPrevious": "lastDeviceListIds",
  "updates": { /* fields based on: ${updateDescription} */ }
}
\`\`\`

### Step 4: Verify Results
Check the batch result summary:
- Confirm success/failure counts
- Report any individual failures with device names
- Optionally re-list devices to verify the changes took effect

## Tips:
- Always list and review before updating - never update blind
- Use \`fields\` parameter to minimize the list response
- For large result sets, consider applying updates in smaller batches
- The \`updates\` object should contain only the fields being changed

Begin by listing devices matching the filter.`;
  }

  if (promptName === 'alert-triage') {
    const severityFilter = args.severity_filter || 'all';
    const resourceFilter = args.resource_filter || '';

    const severityClause = severityFilter !== 'all'
      ? `severity:${severityFilter === 'critical' ? '4' : severityFilter === 'error' ? '3' : '2'}`
      : '';
    const filterParts = [severityClause, resourceFilter].filter(Boolean);
    const combinedFilter = filterParts.length > 0 ? filterParts.join(',') : '';

    return `# Alert Triage Workflow

You are helping to triage LogicMonitor alerts.
Severity focus: ${severityFilter}
${resourceFilter ? `Resource filter: ${resourceFilter}` : 'No resource filter applied.'}

## Workflow Steps:

### Step 1: List Active Alerts
Retrieve current alerts:
\`\`\`json
{
  "operation": "list",
  ${combinedFilter ? `"filter": "${combinedFilter}",` : ''}
  "fields": "id,severity,startEpoch,monitorObjectName,resourceTemplateName,instanceName,dataPointName,alertValue",
  "size": 50
}
\`\`\`

### Step 2: Summarize Alert Landscape
Present a summary to the user:
- Group alerts by severity (critical/error/warning)
- Group by resource or datasource pattern
- Highlight longest-running alerts (oldest startEpoch)
- Note any alert storms (many alerts from same source)

### Step 3: Review Individual Alerts
For alerts requiring attention, get full details:
\`\`\`json
{
  "operation": "get",
  "id": <alert_id>
}
\`\`\`

### Step 4: Take Action
Based on user direction, acknowledge alerts or add notes:
\`\`\`json
{
  "operation": "update",
  "alertId": <alert_id>,
  "action": "ack",
  "ackComment": "<reason for acknowledgement>"
}
\`\`\`

Or add a note:
\`\`\`json
{
  "operation": "update",
  "alertId": <alert_id>,
  "action": "note",
  "noteContent": "<investigation notes>"
}
\`\`\`

### Step 5: Report Summary
After triage, summarize:
- How many alerts were reviewed
- How many were acknowledged/noted
- Any remaining unresolved alerts
- Recommended follow-up actions

## Tips:
- Severity values: 2=warning, 3=error, 4=critical
- Use startEpoch to identify stale alerts that may need attention
- Check if multiple alerts share the same root cause before acknowledging individually
- Add investigation notes before acknowledging to preserve context

Begin by listing the active alerts.`;
  }

  if (promptName === 'export-device-metrics') {
    const deviceIdentifier = args.device_identifier || 'the specified device(s)';
    const datasourceFilter = args.datasource_filter || 'all datasources';
    const timeRangeHours = args.time_range_hours || '24';

    return `# Export Device Metrics Workflow

You are helping to export monitoring data from LogicMonitor for ${deviceIdentifier}.

## Workflow Steps:

### Step 1: Identify Device(s)
Use the \`lm_device\` tool to find the device(s):
- If given a device ID, use: \`{"operation": "get", "id": <device_id>}\`
- If given a name or filter, use: \`{"operation": "list", "filter": "<filter>"}\`
- Store the device ID(s) for the next steps

### Step 2: List Datasources
For each device, use \`lm_device_data\` to list available datasources:
\`\`\`json
{
  "operation": "list_datasources",
  "deviceId": <device_id>,
  "datasourceIncludeFilter": "${datasourceFilter === 'all datasources' ? '' : datasourceFilter}"
}
\`\`\`

Filter the results to datasources with active instances (monitoringInstanceNumber > 0).

### Step 3: List Instances
For each datasource, list its instances:
\`\`\`json
{
  "operation": "list_instances",
  "deviceId": <device_id>,
  "datasourceId": <datasource_id>
}
\`\`\`

Filter out instances where stopMonitoring is true.

### Step 4: Retrieve Metric Data
For each instance (or batch of instances), retrieve the metric data:
\`\`\`json
{
  "operation": "get_data",
  "deviceId": <device_id>,
  "datasourceId": <datasource_id>,
  "instanceIds": [<instance_id1>, <instance_id2>, ...],
  "startDate": "<ISO 8601 timestamp for ${timeRangeHours} hours ago>",
  "endDate": "<ISO 8601 timestamp for now>"
}
\`\`\`

### Step 5: Format Results
Present the data in a structured format showing:
- Device name and ID
- Datasource name
- Instance name
- Time range
- Metric values with timestamps

## Tips:
- Use batch operations (instanceIds array) to retrieve data for multiple instances at once
- The default time range is 24 hours if not specified
- Filter datasources by name pattern to focus on specific metrics (e.g., "CPU*" for CPU metrics)
- Check monitoringInstanceNumber > 0 to ensure datasources have active data

Begin by identifying the device(s) and proceed through each step systematically.`;
  }

  if (promptName === 'collector-health-check') {
    const collectorFilter = args.collector_filter || '';
    const includeGroups = args.include_groups === 'true';

    return `# Collector Health Check Workflow

You are helping to review LogicMonitor collector health and status.
${collectorFilter ? `Collector filter: ${collectorFilter}` : 'Reviewing all collectors.'}
${includeGroups ? 'Including collector group review.' : ''}

## Workflow Steps:

### Step 1: List Collectors
Retrieve collectors to review their status:
\`\`\`json
{
  "operation": "list",
  ${collectorFilter ? `"filter": "${collectorFilter}",` : ''}
  "fields": "id,description,hostname,status,upTime,numberOfHosts,build",
  "autoPaginate": true
}
\`\`\`

### Step 2: Assess Collector Health
Present a summary to the user:
- Group collectors by status (up/down/unknown)
- Flag collectors with high device counts (numberOfHosts > 500)
- Identify collectors with old builds that may need updating
- Note any collectors with low uptime

### Step 3: Review Collector Groups${includeGroups ? `
List collector groups to review assignments and balance:
\`\`\`json
{
  "operation": "list",
  "fields": "id,name,description,numOfCollectors,autoBalance,autoBalanceInstanceCountThreshold",
  "autoPaginate": true
}
\`\`\`

Check for:
- Groups with only one collector (single point of failure)
- Groups with autoBalance disabled that have uneven load
- Groups with high instance count thresholds` : `
(Collector group review was not requested. Set include_groups to "true" to include this step.)`}

### Step 4: Report Summary
Summarize findings:
- Total collectors and their status breakdown
- Any collectors needing attention (down, degraded, outdated)
- Load distribution concerns
- Recommended actions

## Tips:
- Collector status values: up, down
- Check the build version to identify collectors needing updates
- High numberOfHosts on a single collector may indicate load imbalance
- Use lm_collector_group to investigate group-level issues

Begin by listing the collectors.`;
  }

  if (promptName === 'user-audit') {
    const roleFilter = args.role_filter || '';
    const includeApiUsers = args.include_api_users !== 'false';

    return `# User Audit Workflow

You are helping to audit LogicMonitor user accounts.
${roleFilter ? `Role filter: ${roleFilter}` : 'Reviewing all users.'}
${includeApiUsers ? 'Including API-only accounts.' : 'Excluding API-only accounts.'}

## Workflow Steps:

### Step 1: List Users
Retrieve all user accounts:
\`\`\`json
{
  "operation": "list",
  ${roleFilter ? `"filter": "${roleFilter}",` : ''}
  "fields": "id,username,email,firstName,lastName,status,roles,apionly,lastLoginOn,note",
  "autoPaginate": true
}
\`\`\`

### Step 2: Categorize Users
Present a summary to the user:
- Group by role (administrator, readonly, etc.)
- Separate human users from API-only accounts
- Identify suspended or inactive accounts
- Flag users who haven't logged in recently (check lastLoginOn)
${!includeApiUsers ? '- Filter out API-only accounts from the review' : ''}

### Step 3: Identify Concerns
Highlight potential issues:
- Users with administrator roles who may not need them (principle of least privilege)
- Accounts with no recent login activity (potential stale accounts)
- API-only accounts without clear descriptions or notes
- Multiple accounts for the same person (duplicate emails)

### Step 4: Take Action
Based on user direction:
- Suspend inactive accounts: \`{"operation": "update", "id": <user_id>, "status": "suspended"}\`
- Add notes for tracking: \`{"operation": "update", "id": <user_id>, "note": "<audit note>"}\`
- Delete stale accounts: \`{"operation": "delete", "id": <user_id>}\`

### Step 5: Report Summary
Summarize the audit:
- Total users reviewed
- Users by role breakdown
- Actions taken (suspended, noted, deleted)
- Remaining items for follow-up

## Tips:
- Always confirm with the user before suspending or deleting accounts
- Use the note field to record audit findings and dates
- API-only accounts are used for integrations — verify they are still needed before removing
- Check lastLoginOn as an epoch timestamp to calculate days since last login

Begin by listing the users.`;
  }

  if (promptName === 'dashboard-clone') {
    const sourceDashboard = args.source_dashboard || '';
    const targetName = args.target_name || 'Cloned Dashboard';
    const targetGroup = args.target_group || '';

    const isId = /^\d+$/.test(sourceDashboard);

    return `# Dashboard Clone Workflow

You are helping to clone a LogicMonitor dashboard.
Source: ${sourceDashboard}
Target name: ${targetName}
${targetGroup ? `Target group: ${targetGroup}` : 'Target group: same as source'}

## Workflow Steps:

### Step 1: Find Source Dashboard
${isId
  ? `Get the source dashboard by ID:
\`\`\`json
{
  "operation": "get",
  "id": ${sourceDashboard},
  "fields": "id,name,description,groupId,widgetsConfig,widgetTokens,sharable"
}
\`\`\``
  : `Search for the source dashboard:
\`\`\`json
{
  "operation": "list",
  "filter": "${sourceDashboard}",
  "fields": "id,name,description,groupId",
  "size": 10
}
\`\`\`

If multiple results, ask the user to pick the correct one, then get its full config:
\`\`\`json
{
  "operation": "get",
  "id": <selected_id>,
  "fields": "id,name,description,groupId,widgetsConfig,widgetTokens,sharable"
}
\`\`\``}

### Step 2: Review Source Config
Present the source dashboard details to the user:
- Dashboard name and description
- Current group assignment
- Number of widgets
- Widget tokens (dynamic variables)
- Sharing settings

### Step 3: Create Clone
Create the new dashboard using the source config:
\`\`\`json
{
  "operation": "create",
  "name": "${targetName}",
  "description": "Cloned from: ${sourceDashboard}",
  "groupId": ${targetGroup || '<source_groupId>'},
  "widgetsConfig": <source_widgetsConfig>,
  "widgetTokens": <source_widgetTokens>,
  "sharable": <source_sharable>
}
\`\`\`

### Step 4: Verify Clone
Get the newly created dashboard to confirm:
\`\`\`json
{
  "operation": "get",
  "id": <new_dashboard_id>
}
\`\`\`

Confirm the clone matches the source configuration.

## Tips:
- Widget tokens often contain device or group references that may need updating for the target environment
- If cloning for a different environment, review and update token values after cloning
- The widgetsConfig contains the full widget layout — it copies as-is
- Set sharable to false initially if the clone is for testing

Begin by finding the source dashboard.`;
  }

  return 'Unknown prompt';
}

/**
 * List all available prompts
 */
export function listPrompts(): Prompt[] {
  return [
    exportDeviceMetricsPrompt,
    batchDeviceUpdatePrompt,
    alertTriagePrompt,
    collectorHealthCheckPrompt,
    userAuditPrompt,
    dashboardClonePrompt
  ];
}

/**
 * Get a specific prompt by name
 */
export function getPrompt(name: string): Prompt | undefined {
  const prompts = listPrompts();
  return prompts.find(p => p.name === name);
}

