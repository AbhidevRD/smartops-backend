#!/usr/bin/env node

/**
 * SmartOps AI Endpoints Test Suite
 * 
 * Usage:
 * node test-ai-endpoints.js <jwt_token> <project_id>
 * 
 * Example:
 * node test-ai-endpoints.js "eyJhbGc..." "proj_123..."
 */

import axios from 'axios';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const TIMEOUT = 15000;

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  timeout: TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Test results tracker
let passed = 0;
let failed = 0;
const results = [];

// Helper function
async function test(name, method, url, data, token) {
  try {
    console.log(`\n[TEST] ${name}`);
    console.log(`  ${method} ${url}`);

    const config = {
      headers: {
        Authorization: `Bearer ${token}`
      }
    };

    let response;
    if (method === 'GET') {
      response = await api.get(url, config);
    } else if (method === 'POST') {
      response = await api.post(url, data, config);
    }

    const success = response.data?.success !== false;
    if (success) {
      console.log(`  ✓ PASSED`);
      passed++;
    } else {
      console.log(`  ✗ FAILED - ${response.data?.error || 'Unknown error'}`);
      failed++;
    }

    results.push({ name, success, status: response.status });
    return response.data;

  } catch (error) {
    console.log(`  ✗ ERROR - ${error.message}`);
    if (error.response?.data) {
      console.log(`  Response: ${JSON.stringify(error.response.data)}`);
    }
    failed++;
    results.push({ name, success: false, error: error.message });
  }
}

// Main test suite
async function runTests() {
  const token = process.argv[2];
  const projectId = process.argv[3];

  if (!token || !projectId) {
    console.error('Usage: node test-ai-endpoints.js <jwt_token> <project_id>');
    process.exit(1);
  }

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║      SmartOps AI Endpoints - Test Suite                ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`\nAPI Base: ${API_BASE}`);
  console.log(`Project ID: ${projectId}`);
  console.log(`Token: ${token.substring(0, 20)}...`);

  // Test 1: Parse Task
  await test(
    'Parse Task (NLP)',
    'POST',
    '/api/ai/parse-task',
    { text: 'Create a login bug fix with high priority' },
    token
  );

  // Test 2: Prioritize Task
  await test(
    'Prioritize Task',
    'POST',
    '/api/ai/priority',
    { title: 'Fix critical bug', dueDays: 1, workload: 5 },
    token
  );

  // Test 3: Generate Standup
  await test(
    'Generate Standup',
    'GET',
    '/api/ai/standup',
    null,
    token
  );

  // Test 4: Get Burnout Analysis
  await test(
    'Burnout Analysis',
    'GET',
    '/api/ai/burnout',
    null,
    token
  );

  // Test 5: Get Sentiment Analysis
  await test(
    'Sentiment Analysis',
    'GET',
    '/api/ai/sentiment',
    null,
    token
  );

  // Test 6: Detect Bottlenecks
  await test(
    'Bottleneck Detection',
    'GET',
    '/api/ai/bottleneck',
    null,
    token
  );

  // Test 7: Velocity Forecast
  await test(
    'Velocity Forecast',
    'GET',
    `/api/ai/velocity/${projectId}`,
    null,
    token
  );

  // Test 8: Notes to Tasks
  await test(
    'Extract Tasks from Notes',
    'POST',
    '/api/ai/notes-to-tasks',
    {
      projectId,
      notes: '1. Fix database migration\n2. Update API docs\n3. Deploy to production'
    },
    token
  );

  // Test 9: Voice Command
  await test(
    'Voice Command Processing',
    'POST',
    '/api/ai/voice-command',
    {
      projectId,
      command: 'Create a task to implement new search feature'
    },
    token
  );

  // Test 10: Sprint Planning
  await test(
    'Sprint Planning',
    'POST',
    '/api/ai/sprint-plan',
    {
      projectId,
      capacityHours: 40
    },
    token
  );

  // Test 11: Dependency Graph
  await test(
    'Dependency Graph',
    'GET',
    `/api/ai/dependency/${projectId}`,
    null,
    token
  );

  // Test 12: Pomodoro Start
  await test(
    'Start Pomodoro',
    'POST',
    '/api/ai/pomodoro/start',
    {
      minutes: 25
    },
    token
  );

  // Test 13: Pomodoro Stats
  await test(
    'Pomodoro Stats',
    'GET',
    '/api/ai/pomodoro/stats',
    null,
    token
  );

  // Test 14: Leaderboard
  await test(
    'Get Leaderboard',
    'GET',
    '/api/ai/leaderboard',
    null,
    token
  );

  // Test 15: Check Badges
  await test(
    'Check Badges',
    'POST',
    '/api/ai/badges/check',
    {},
    token
  );

  // Print Summary
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUMMARY                        ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`\nTotal Tests: ${passed + failed}`);
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed`);
  }

  console.log('\n');
  process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error.message);
  process.exit(1);
});

async function testEndpoint(method, endpoint, data = null, testName = '') {
  try {
    let response;
    if (method === 'GET') {
      response = await api.get(endpoint);
    } else if (method === 'POST') {
      response = await api.post(endpoint, data);
    }

    const success = response.data.success !== false;
    logTest(testName || `${method} ${endpoint}`, success, response.data);
    return response.data;
  } catch (error) {
    logTest(
      testName || `${method} ${endpoint}`,
      false,
      error.response?.data?.error || error.message
    );
    return null;
  }
}

async function runTests() {
  log('\n========================================', 'blue');
  log('SmartOps AI Layer - Endpoint Testing', 'blue');
  log('========================================\n', 'blue');

  // 1. Parse Task
  log('1. Testing parseTask endpoint...', 'yellow');
  await testEndpoint(
    'POST',
    '/api/ai/parse-task',
    { text: 'Create login UI with authentication by Friday' },
    'Parse task from natural language'
  );

  // 2. Prioritize Task
  log('\n2. Testing prioritizeTask endpoint...', 'yellow');
  await testEndpoint(
    'POST',
    '/api/ai/priority',
    { title: 'Fix critical bug', dueDays: 1, workload: 5 },
    'AI Priority Analysis'
  );

  // 3. Generate Standup
  log('\n3. Testing generateStandup endpoint...', 'yellow');
  await testEndpoint(
    'GET',
    '/api/ai/standup',
    null,
    'Generate Daily Standup'
  );

  // 4. Risk Prediction (needs valid taskId)
  log('\n4. Testing riskPredictor endpoint...', 'yellow');
  await testEndpoint(
    'GET',
    '/api/ai/risk/task-sample-123',
    null,
    'Task Risk Prediction'
  );

  // 5. Velocity Forecast (needs valid projectId)
  log('\n5. Testing velocityForecast endpoint...', 'yellow');
  await testEndpoint(
    'GET',
    '/api/ai/velocity/project-sample-456',
    null,
    'Project Velocity Forecast'
  );

  // 6. Bottleneck Detection
  log('\n6. Testing bottleneckDetector endpoint...', 'yellow');
  await testEndpoint(
    'GET',
    '/api/ai/bottleneck',
    null,
    'Detect Project Bottlenecks'
  );

  // 7. Burnout Analysis
  log('\n7. Testing burnoutDetector endpoint...', 'yellow');
  await testEndpoint(
    'GET',
    '/api/ai/burnout',
    null,
    'Team Burnout Analysis'
  );

  // 8. Sentiment Analysis
  log('\n8. Testing sentimentAnalysis endpoint...', 'yellow');
  await testEndpoint(
    'GET',
    '/api/ai/sentiment',
    null,
    'Team Sentiment Analysis'
  );

  // 9. Extract Tasks from Notes
  log('\n9. Testing notesToTasks endpoint...', 'yellow');
  await testEndpoint(
    'POST',
    '/api/ai/notes-to-tasks',
    {
      projectId: 'project-sample-789',
      notes: 'Meeting:\n- Setup CI/CD pipeline\n- Review code changes\n- Deploy to staging'
    },
    'Extract Tasks from Meeting Notes'
  );

  // 10. Voice Command
  log('\n10. Testing voiceCommand endpoint...', 'yellow');
  await testEndpoint(
    'POST',
    '/api/ai/voice-command',
    {
      projectId: 'project-sample-789',
      command: 'Create urgent bug fix task for payment module'
    },
    'Process Voice Command'
  );

  // 11. Dependency Graph
  log('\n11. Testing dependencyGraph endpoint...', 'yellow');
  await testEndpoint(
    'GET',
    '/api/ai/dependency/project-sample-456',
    null,
    'Generate Task Dependency Graph'
  );

  // 12. Sprint Planning
  log('\n12. Testing sprintPlanner endpoint...', 'yellow');
  await testEndpoint(
    'POST',
    '/api/ai/sprint-plan',
    { projectId: 'project-sample-789', capacityHours: 40 },
    'Plan Sprint Allocation'
  );

  // 13. Pomodoro Start
  log('\n13. Testing startPomodoro endpoint...', 'yellow');
  await testEndpoint(
    'POST',
    '/api/ai/pomodoro/start',
    { taskId: 'task-sample-123', minutes: 25 },
    'Start Pomodoro Session'
  );

  // 14. Pomodoro Stats
  log('\n14. Testing focusStats endpoint...', 'yellow');
  await testEndpoint(
    'GET',
    '/api/ai/pomodoro/stats',
    null,
    'Get Pomodoro Statistics'
  );

  // 15. Leaderboard
  log('\n15. Testing leaderboard endpoint...', 'yellow');
  await testEndpoint(
    'GET',
    '/api/ai/leaderboard',
    null,
    'Get Leaderboard'
  );

  // 16. Badges
  log('\n16. Testing awardBadges endpoint...', 'yellow');
  await testEndpoint(
    'POST',
    '/api/ai/badges/check',
    null,
    'Check and Award Badges'
  );

  // Summary
  log('\n========================================', 'blue');
  log('TEST SUMMARY', 'blue');
  log('========================================', 'blue');
  log(`✅ Passed: ${passed}`, 'green');
  log(`❌ Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`Total: ${passed + failed}\n`, 'cyan');

  if (failed === 0) {
    log('🎉 All tests passed! AI layer is ready.', 'green');
  } else {
    log(`⚠️  ${failed} test(s) failed. Check setup.`, 'yellow');
  }
}

// Run tests
log('Connecting to API...', 'cyan');
log(`Base URL: ${BASE_URL}\n`, 'cyan');

runTests().catch(err => {
  log(`Fatal error: ${err.message}`, 'red');
  process.exit(1);
});
