/**
 * Global test setup for Vigil Guard workflow tests
 * Runs once before all tests
 */

const WEBHOOK_URL = 'http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1';

export async function setup() {
  console.log('🔧 Setting up test environment...');

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
