/**
 * Global test setup for Vigil Guard workflow tests
 * Runs once before all tests
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from repository root (two directories up)
const envPath = resolve(process.cwd(), '../../.env');
config({ path: envPath });

// Use centralized webhook URL configuration from helpers
import { WEBHOOK_URL } from './helpers/webhook.js';

export async function setup() {
  console.log('🔧 Setting up test environment...');
  console.log('');

  // ClickHouse password configuration
  if (!process.env.CLICKHOUSE_PASSWORD) {
    console.error('❌ CLICKHOUSE_PASSWORD not found in .env');
    console.error('');
    console.error('Please set CLICKHOUSE_PASSWORD in .env file:');
    console.error('  echo "CLICKHOUSE_PASSWORD=your_password" >> .env');
    console.error('');
    console.error('Or run: ./tests/verify-clickhouse.sh to test connection');
    process.exit(1);
  }

  console.log('✅ ClickHouse password loaded from .env');
  console.log('   Password length:', process.env.CLICKHOUSE_PASSWORD.length);

  // Verify n8n is running
  try {
    const response = await fetch('http://localhost:5678', {
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error(`n8n UI returned HTTP ${response.status}`);
    }

    console.log('✅ n8n is running');
  } catch (error) {
    console.error('❌ n8n is not accessible:', error.message);
    console.error('   Please start n8n: docker-compose up -d vigil-n8n');
    process.exit(1);
  }

  // Verify webhook is active
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatInput: 'health-check' })
    });

    if (!response.ok) {
      throw new Error(`Webhook returned HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Webhook is active and responding');
    console.log(`   Session ID: ${data.sessionId}`);
  } catch (error) {
    console.error('❌ Webhook is not active:', error.message);
    console.error('   Please activate workflow in n8n UI: http://localhost:5678');
    console.error('   Workflow: Vigil-Guard-v1.0');
    process.exit(1);
  }

  // Verify ClickHouse is accessible
  try {
    const response = await fetch('http://localhost:8123/ping');
    if (!response.ok) {
      throw new Error(`ClickHouse ping returned HTTP ${response.status}`);
    }
    console.log('✅ ClickHouse is accessible');
  } catch (error) {
    console.warn('⚠️  ClickHouse is not accessible:', error.message);
    console.warn('   Tests will continue, but database verification will be skipped');
  }

  console.log('🚀 Test environment ready!\n');
}

export async function teardown() {
  console.log('\n✨ Test suite completed');
}
