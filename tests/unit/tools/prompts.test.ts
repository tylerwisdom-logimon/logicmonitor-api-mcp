/**
 * Unit tests for MCP prompt functions
 * Pure unit tests — no network access or LM credentials required.
 */

import {
  listPrompts,
  getPrompt,
  getPromptContent,
} from '../../../src/tools/prompts.js';

describe('listPrompts', () => {
  it('returns all 6 prompts', () => {
    const prompts = listPrompts();
    expect(prompts).toHaveLength(6);
  });

  it('every prompt has a name and description', () => {
    const prompts = listPrompts();
    for (const prompt of prompts) {
      expect(prompt.name).toBeTruthy();
      expect(prompt.description).toBeTruthy();
    }
  });

  it('contains the expected prompt names', () => {
    const names = listPrompts().map(p => p.name);
    expect(names).toContain('export-device-metrics');
    expect(names).toContain('batch-device-update');
    expect(names).toContain('alert-triage');
    expect(names).toContain('collector-health-check');
    expect(names).toContain('user-audit');
    expect(names).toContain('dashboard-clone');
  });
});

describe('getPrompt', () => {
  it('returns the correct prompt for batch-device-update', () => {
    const prompt = getPrompt('batch-device-update');
    expect(prompt).toBeDefined();
    expect(prompt!.name).toBe('batch-device-update');
    expect(prompt!.description).toContain('batch');
  });

  it('returns undefined for a nonexistent prompt', () => {
    const prompt = getPrompt('nonexistent');
    expect(prompt).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    const prompt = getPrompt('');
    expect(prompt).toBeUndefined();
  });
});

describe('getPromptContent', () => {
  // ── batch-device-update ──────────────────────────────────────────

  it('returns non-empty content for batch-device-update with key workflow steps', () => {
    const content = getPromptContent('batch-device-update', {
      device_filter: 'displayName:*prod*',
      update_description: 'disable alerting',
    });

    expect(content.length).toBeGreaterThan(0);
    // Key workflow sections
    expect(content).toContain('Batch Device Update Workflow');
    expect(content).toContain('Find Matching Devices');
    expect(content).toContain('Review Devices');
    expect(content).toContain('Apply Batch Update');
    expect(content).toContain('Verify Results');
    // Args should appear in the content
    expect(content).toContain('displayName:*prod*');
    expect(content).toContain('disable alerting');
  });

  // ── collector-health-check (with groups) ─────────────────────────

  it('returns content with group review section when include_groups is true', () => {
    const content = getPromptContent('collector-health-check', {
      collector_filter: '',
      include_groups: 'true',
    });

    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('Collector Health Check Workflow');
    // Group review section should be expanded when include_groups is true
    expect(content).toContain('autoBalance');
    expect(content).toContain('single point of failure');
  });

  it('omits detailed group review when include_groups is not true', () => {
    const content = getPromptContent('collector-health-check', {
      collector_filter: '',
      include_groups: 'false',
    });

    expect(content).toContain('Collector Health Check Workflow');
    expect(content).toContain('Collector group review was not requested');
  });

  // ── user-audit ───────────────────────────────────────────────────

  it('returns content for user-audit with empty args', () => {
    const content = getPromptContent('user-audit', {});

    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('User Audit Workflow');
    expect(content).toContain('List Users');
    expect(content).toContain('Categorize Users');
  });

  // ── dashboard-clone ──────────────────────────────────────────────

  it('returns content for dashboard-clone with numeric source ID', () => {
    const content = getPromptContent('dashboard-clone', {
      source_dashboard: '123',
      target_name: 'Test Dashboard',
    });

    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('Dashboard Clone Workflow');
    expect(content).toContain('Test Dashboard');
    expect(content).toContain('123');
    // Numeric ID should trigger the "get" path
    expect(content).toContain('"operation": "get"');
  });

  it('returns content for dashboard-clone with name filter', () => {
    const content = getPromptContent('dashboard-clone', {
      source_dashboard: 'name:*Production*',
      target_name: 'Staging Copy',
    });

    expect(content).toContain('Dashboard Clone Workflow');
    // Non-numeric source should trigger the "list" path
    expect(content).toContain('"operation": "list"');
  });

  // ── export-device-metrics ────────────────────────────────────────

  it('returns content for export-device-metrics', () => {
    const content = getPromptContent('export-device-metrics', {
      device_identifier: 'server-01',
      time_range_hours: '48',
    });

    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('Export Device Metrics Workflow');
    expect(content).toContain('server-01');
    expect(content).toContain('48');
  });

  // ── alert-triage ─────────────────────────────────────────────────

  it('returns content for alert-triage', () => {
    const content = getPromptContent('alert-triage', {
      severity_filter: 'critical',
    });

    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('Alert Triage Workflow');
    expect(content).toContain('critical');
  });

  // ── unknown prompt ───────────────────────────────────────────────

  it('returns "Unknown prompt" for an unrecognized prompt name', () => {
    const content = getPromptContent('unknown', {});
    expect(content).toBe('Unknown prompt');
  });

  it('returns "Unknown prompt" for an empty prompt name', () => {
    const content = getPromptContent('', {});
    expect(content).toBe('Unknown prompt');
  });
});
