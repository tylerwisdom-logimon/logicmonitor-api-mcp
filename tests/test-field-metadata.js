#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadFieldMetadata() {
  const distPath = resolve(__dirname, '../dist/utils/fieldMetadata.js');
  try {
    return await import(`file://${distPath}`);
  } catch (error) {
    throw new Error('Unable to load compiled fieldMetadata module. Run "npm run build" first.', { cause: error });
  }
}

const resources = [
  { key: 'device', label: 'Devices', sample: 'id' },
  { key: 'deviceGroup', label: 'Device Groups', sample: 'id' },
  { key: 'website', label: 'Websites', sample: 'id' },
  { key: 'websiteGroup', label: 'Website Groups', sample: 'id' },
  { key: 'collector', label: 'Collectors', sample: 'id' },
  { key: 'alert', label: 'Alerts', sample: 'id' }
];

async function main() {
  const { getKnownFields, sanitizeFields } = await loadFieldMetadata();
  console.log('🔍 Valid field names per LogicMonitor resource (sourced from docs/swagger.json):\n');

  for (const { key, label, sample } of resources) {
    const fields = Array.from(getKnownFields(key)).sort();
    if (!fields.includes(sample)) {
      throw new Error(`Expected field "${sample}" was not found for resource "${key}".`);
    }

    const sanitized = sanitizeFields(key, `${sample},nonexistent_field`);
    if (!sanitized.applied.includes(sample) || !sanitized.invalid.includes('nonexistent_field')) {
      throw new Error(`Field sanitization check failed for resource "${key}".`);
    }

    console.log(`• ${label} (${fields.length} fields)`);
    console.log(`  ${fields.join(', ')}`);
    console.log();
  }

  console.log('✅ Field metadata parsing succeeded.');
}

main().catch((error) => {
  console.error('❌ Field metadata test failed:', error);
  process.exitCode = 1;
});
