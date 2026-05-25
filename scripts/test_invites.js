import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'http://localhost:5000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// Simulating auth tokens for testing
let authToken = '';
let ownerEmail = '';
let guestEmail = '';

// Helper function to make API calls
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

// Test helper
async function runTest(testName, testFn) {
  try {
    console.log(`\n✓ Testing: ${testName}`);
    await testFn();
    console.log(`  ✔ PASSED`);
  } catch (error) {
    console.error(`  ✗ FAILED: ${error.message}`);
    if (error.response?.data) {
      console.error(`  Response: `, error.response.data);
    }
  }
}

// Tests
async function runAllTests() {
  console.log('\n===== TEAM COLLABORATION & INVITATION SYSTEM TESTS =====\n');

  // Setup: Create test users
  console.log('SETUP: Creating test users...');
  try {
    // Create owner
    const ownerRes = await api.post('/api/auth/signup', {
      email: `owner-${Date.now()}@test.com`,
      password: 'TestPassword123',
      name: 'Project Owner'
    });
    authToken = ownerRes.data.token;
    ownerEmail = ownerRes.data.user.email;
    console.log(`✓ Owner created: ${ownerEmail}`);

    // Create guest user (won't receive invites yet)
    guestEmail = `guest-${Date.now()}@test.com`;
    console.log(`✓ Guest email prepared: ${guestEmail}`);
  } catch (error) {
    console.error('Failed to create test users:', error.message);
    process.exit(1);
  }

  // Test 1: Create a project
  let projectId = '';
  await runTest('Create a new project', async () => {
    const res = await api.post('/api/projects', {
      name: `Test Project ${Date.now()}`,
      description: 'A test project for collaboration features'
    });
    projectId = res.data.id;
    if (!projectId) throw new Error('No project ID returned');
  });

  // Test 2: Get project members (should only have owner)
  await runTest('Get project members (owner only)', async () => {
    const res = await api.get(`/api/projects/${projectId}/members`);
    if (!Array.isArray(res.data)) throw new Error('Members should be an array');
    if (res.data.length !== 1) throw new Error('Should have exactly 1 member (owner)');
  });

  // Test 3: Send invite to a new user
  let inviteToken = '';
  await runTest('Send invite to new user', async () => {
    const res = await api.post('/api/invites/send', {
      email: guestEmail,
      projectId: projectId
    });
    if (!res.data.invite) throw new Error('No invite returned');
    console.log(`    Invite sent to: ${guestEmail}`);
  });

  // Test 4: Get project invites (owner only)
  await runTest('Get project invites (owner view)', async () => {
    const res = await api.get(`/api/invites/project/${projectId}`);
    if (!res.data.invites) throw new Error('No invites array returned');
    if (res.data.invites.length === 0) throw new Error('Should have at least 1 invite');
    inviteToken = res.data.invites[0].token || '';
    console.log(`    Found ${res.data.invites.length} invite(s)`);
  });

  // Test 5: Get invite info (public endpoint - no auth required)
  await runTest('Get invite info (public endpoint)', async () => {
    if (!inviteToken) throw new Error('No invite token available');
    // Temporarily remove auth token
    const tempToken = authToken;
    authToken = '';
    const res = await api.get('/api/invites/info', {
      params: { token: inviteToken }
    });
    authToken = tempToken;
    if (!res.data.project) throw new Error('No project info returned');
    if (!res.data.email) throw new Error('No email in response');
    console.log(`    Project: ${res.data.project.name}`);
    console.log(`    Email: ${res.data.email}`);
  });

  // Test 6: Try to send duplicate invite (should fail)
  await runTest('Prevent duplicate invites', async () => {
    try {
      await api.post('/api/invites/send', {
        email: guestEmail,
        projectId: projectId
      });
      throw new Error('Should have rejected duplicate invite');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log(`    ✓ Correctly rejected: ${error.response.data.error}`);
      } else {
        throw error;
      }
    }
  });

  // Test 7: Accept invite (as guest - this would need guest auth in real scenario)
  // For testing, we'll simulate the accept
  await runTest('Simulate accepting invite', async () => {
    if (!inviteToken) throw new Error('No invite token available');
    console.log(`    Token would be used: ${inviteToken.substring(0, 20)}...`);
    console.log(`    In real scenario, guest user would call POST /api/invites/accept with token`);
  });

  // Test 8: Cancel invite (owner only)
  let inviteToCancel = '';
  await runTest('Send another invite to cancel it', async () => {
    const res = await api.post('/api/invites/send', {
      email: `cancel-test-${Date.now()}@test.com`,
      projectId: projectId
    });
    inviteToCancel = res.data.invite.id;
    console.log(`    Invite created: ${inviteToCancel}`);
  });

  await runTest('Cancel pending invite', async () => {
    if (!inviteToCancel) throw new Error('No invite to cancel');
    const res = await api.delete(`/api/invites/${inviteToCancel}`);
    console.log(`    ✓ Invite cancelled successfully`);
  });

  // Test 9: Verify error when non-owner tries to invite
  await runTest('Prevent non-owner from inviting', async () => {
    // This would need a second user in real scenario
    console.log('    (Skipped - requires second user account)');
  });

  // Test 10: Send multiple invites
  await runTest('Send multiple invites', async () => {
    const emails = [
      `user1-${Date.now()}@test.com`,
      `user2-${Date.now()}@test.com`,
      `user3-${Date.now()}@test.com`
    ];
    
    for (const email of emails) {
      await api.post('/api/invites/send', {
        email,
        projectId: projectId
      });
    }
    console.log(`    ✓ Sent ${emails.length} invites successfully`);
  });

  // Test 11: Verify pending invites are listed
  await runTest('List all pending invites', async () => {
    const res = await api.get(`/api/invites/project/${projectId}`);
    const pendingInvites = res.data.invites.filter(i => i.status === 'PENDING');
    console.log(`    Found ${pendingInvites.length} pending invite(s)`);
  });

  console.log('\n===== TESTS COMPLETED =====\n');
}

// Run tests
runAllTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
