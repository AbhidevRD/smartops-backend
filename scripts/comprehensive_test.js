import axios from 'axios';

const base = 'http://localhost:3000';
const client = axios.create({ validateStatus: () => true });

let token = '';
let userId = '';
let projectId = '';
let taskId = '';

function log(status, title, result) {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '→';
  console.log(`\n${icon} ${title}`);
  if (result && typeof result === 'object') {
    console.log(JSON.stringify(result, null, 2));
  } else if (result) {
    console.log(result);
  }
}

async function test(name, fn) {
  try {
    const result = await fn();
    log('PASS', name, result);
    return result;
  } catch (err) {
    log('FAIL', name, { error: err.message, detail: err.response?.data || err });
    return null;
  }
}

async function run() {
  console.log('\n========== COMPREHENSIVE BACKEND TEST ==========\n');

  // 1. AUTH FLOW
  console.log('=== AUTH FLOW ===');
  const email = `test+${Date.now()}@example.com`;

  await test('POST /api/auth/signup', async () => {
    const res = await client.post(base + '/api/auth/signup', {
      name: 'Test User',
      email,
      password: 'Pass123!'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.otp) throw new Error('No OTP returned');
    return { status: res.status, otp: res.data.otp };
  });

  const signup = await client.post(base + '/api/auth/signup', {
    name: 'Test User', email, password: 'Pass123!'
  });
  const otp = signup.data.otp;

  await test('POST /api/auth/verify-otp', async () => {
    const res = await client.post(base + '/api/auth/verify-otp', { email, otp });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    return res.data;
  });

  await test('POST /api/auth/login', async () => {
    const res = await client.post(base + '/api/auth/login', { email, password: 'Pass123!' });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    token = res.data.token;
    userId = res.data.user.id;
    return { status: res.status, user: res.data.user.email, hasToken: !!token };
  });

  await test('POST /api/auth/resend-otp', async () => {
    const res = await client.post(base + '/api/auth/resend-otp', { email });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return { status: res.status, hasOtp: !!res.data.otp };
  });

  await test('POST /api/auth/forgot-password', async () => {
    const res = await client.post(base + '/api/auth/forgot-password', { email });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return { status: res.status, hasResetOtp: !!res.data.otp };
  });

  const resetResp = await client.post(base + '/api/auth/forgot-password', { email });
  const resetOtp = resetResp.data.otp;

  await test('POST /api/auth/reset-password', async () => {
    const res = await client.post(base + '/api/auth/reset-password', {
      email, otp: resetOtp, password: 'NewPass123!'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return res.data;
  });

  // 2. PUBLIC ROUTES
  console.log('\n=== PUBLIC ROUTES ===');

  await test('GET /', async () => {
    const res = await client.get(base + '/');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return { status: res.status, message: res.data.message };
  });

  await test('GET /test-db', async () => {
    const res = await client.get(base + '/test-db');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return { status: res.status, userCount: res.data.userCount };
  });

  // 3. PROJECTS CRUD
  console.log('\n=== PROJECTS CRUD ===');

  await test('POST /api/projects (create)', async () => {
    const res = await client.post(base + '/api/projects', 
      { name: 'Test Project', description: 'A test project' },
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (res.status !== 201 && res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    projectId = res.data.id || res.data.data?.id;
    return { status: res.status, projectId, name: res.data.name || res.data.data?.name };
  });

  if (!projectId) {
    log('FAIL', 'Projects CRUD', 'No projectId obtained; skipping dependent tests');
  } else {
    await test('GET /api/projects (list)', async () => {
      const res = await client.get(base + '/api/projects',
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      return { status: res.status, count: Array.isArray(res.data) ? res.data.length : res.data.data?.length };
    });

    await test(`GET /api/projects/${projectId}`, async () => {
      const res = await client.get(base + `/api/projects/${projectId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return { status: res.status, name: res.data.name || res.data.data?.name };
    });

    await test(`PUT /api/projects/${projectId} (update)`, async () => {
      const res = await client.put(base + `/api/projects/${projectId}`,
        { name: 'Updated Project', description: 'Updated' },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return { status: res.status, updated: true };
    });

    // 4. TASKS CRUD
    console.log('\n=== TASKS CRUD ===');

    await test('POST /api/tasks (create)', async () => {
      const res = await client.post(base + '/api/tasks',
        {
          title: 'Test Task',
          description: 'A test task',
          projectId,
          priority: 'HIGH',
          deadline: new Date(Date.now() + 86400000).toISOString(),
          assigneeId: userId
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.status !== 201 && res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      taskId = res.data.id || res.data.data?.id;
      return { status: res.status, taskId, title: res.data.title || res.data.data?.title };
    });

    if (!taskId) {
      log('FAIL', 'Tasks CRUD', 'No taskId obtained; skipping dependent tests');
    } else {
      await test('GET /api/tasks (list)', async () => {
        const res = await client.get(base + '/api/tasks',
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (res.status !== 200) throw new Error(`Status ${res.status}`);
        return { status: res.status, count: Array.isArray(res.data) ? res.data.length : res.data.data?.length };
      });

      await test(`GET /api/tasks/${taskId}`, async () => {
        const res = await client.get(base + `/api/tasks/${taskId}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (res.status !== 200) throw new Error(`Status ${res.status}`);
        return { status: res.status, title: res.data.title || res.data.data?.title };
      });

      await test(`PUT /api/tasks/${taskId} (update status to DONE)`, async () => {
        const res = await client.put(base + `/api/tasks/${taskId}`,
          { status: 'DONE', title: 'Test Task Updated' },
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
        return { status: res.status, updatedStatus: res.data.status || res.data.data?.status };
      });
    }
  }

  // 5. DASHBOARD
  console.log('\n=== DASHBOARD ROUTES ===');

  await test('GET /api/dashboard', async () => {
    const res = await client.get(base + '/api/dashboard',
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return { status: res.status, hasData: !!res.data };
  });

  await test('GET /api/dashboard/stats', async () => {
    const res = await client.get(base + '/api/dashboard/stats',
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return { status: res.status, hasStats: !!res.data };
  });

  // 6. AI ROUTES (Category B)
  console.log('\n=== AI ROUTES ===');

  await test('POST /api/ai/parse-task', async () => {
    const res = await client.post(base + '/api/ai/parse-task',
      { text: 'Add login bug fix for Friday' },
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (res.status === 405 || res.status === 404) return { status: res.status, note: 'endpoint not implemented' };
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return { status: res.status, hasResult: !!res.data };
  });

  await test('GET /api/ai/standup', async () => {
    const res = await client.get(base + '/api/ai/standup',
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (res.status === 405 || res.status === 404) return { status: res.status, note: 'endpoint not implemented' };
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return { status: res.status, hasData: !!res.data };
  });

  // 7. EMAIL ROUTES
  console.log('\n=== EMAIL ROUTES ===');

  await test('POST /api/admin-email/send', async () => {
    const res = await client.post(base + '/api/admin-email/send',
      { email: 'test@example.com', subject: 'Test', message: 'Test message' },
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (res.status === 405 || res.status === 404) return { status: res.status, note: 'endpoint not implemented' };
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return { status: res.status, success: res.data.success };
  });

  await test('GET /api/admin-email/logs', async () => {
    const res = await client.get(base + '/api/admin-email/logs',
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (res.status === 405 || res.status === 404) return { status: res.status, note: 'endpoint not implemented' };
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return { status: res.status, logCount: Array.isArray(res.data) ? res.data.length : res.data.logs?.length };
  });

  // 8. CHAT ROUTES
  console.log('\n=== CHAT ROUTES ===');

  if (projectId) {
    await test('POST /api/chat/send', async () => {
      const res = await client.post(base + '/api/chat/send',
        { projectId, message: 'Test chat message' },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.status === 405 || res.status === 404) return { status: res.status, note: 'endpoint not implemented' };
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      return { status: res.status, messageId: res.data.data?.id };
    });

    await test(`GET /api/chat/history/${projectId}`, async () => {
      const res = await client.get(base + `/api/chat/history/${projectId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.status === 405 || res.status === 404) return { status: res.status, note: 'endpoint not implemented' };
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      return { status: res.status, messageCount: Array.isArray(res.data) ? res.data.length : res.data.length };
    });
  }

  // 9. DB CONSISTENCY CHECK
  console.log('\n=== DB CONSISTENCY ===');

  await test('GET /test-db (final check)', async () => {
    const res = await client.get(base + '/test-db');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return { status: res.status, userCount: res.data.userCount };
  });

  console.log('\n========== TEST COMPLETE ==========\n');
}

run().catch(console.error);
