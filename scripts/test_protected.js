import axios from 'axios';

const base = 'http://localhost:3000';

async function testProtected() {
  try {
    // 1. Get a token via login (reusing existing user or creating one)
    const signupRes = await axios.post(base + '/api/auth/signup', {
      name: 'Protected Test User',
      email: `prottest+${Date.now()}@example.com`,
      password: 'Pass123!'
    });
    
    console.log('1. Signup:', signupRes.status);
    const otp = signupRes.data.otp;

    const verifyRes = await axios.post(base + '/api/auth/verify-otp', {
      email: signupRes.data.message ? 'prottest@example.com' : `prottest+${Date.now()}@example.com`,
      otp
    });
    console.log('2. Verify:', verifyRes.status);

    const loginRes = await axios.post(base + '/api/auth/login', {
      email: signupRes.data.message ? 'prottest@example.com' : `prottest+${Date.now()}@example.com`,
      password: 'Pass123!'
    });
    console.log('3. Login:', loginRes.status);
    
    const token = loginRes.data.token;
    const userId = loginRes.data.user.id;
    console.log('   Token received:', token.slice(0, 20) + '...');

    // 2. Test protected routes with token
    console.log('\n--- Testing Protected Routes ---\n');

    // Test POST /api/projects
    const projRes = await axios.post(base + '/api/projects', 
      { name: 'My Project', description: 'Test project' },
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    console.log('4. POST /api/projects:', projRes.status, projRes.data.id);
    const projectId = projRes.data.id;

    // Test GET /api/projects
    const listRes = await axios.get(base + '/api/projects',
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    console.log('5. GET /api/projects:', listRes.status, 'count:', listRes.data.length);

    // Test GET /api/projects/:id
    if (projectId) {
      const getRes = await axios.get(base + `/api/projects/${projectId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      console.log('6. GET /api/projects/:id:', getRes.status, getRes.data.name);

      // Test POST /api/tasks
      const taskRes = await axios.post(base + '/api/tasks',
        {
          title: 'My Task',
          projectId,
          priority: 'HIGH',
          status: 'TODO',
          assigneeId: userId
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      console.log('7. POST /api/tasks:', taskRes.status, taskRes.data.id);

      // Test GET /api/tasks
      const tasksRes = await axios.get(base + '/api/tasks',
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      console.log('8. GET /api/tasks:', tasksRes.status, 'count:', tasksRes.data.length || 0);

      // Test GET /api/dashboard
      const dashRes = await axios.get(base + '/api/dashboard',
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      console.log('9. GET /api/dashboard:', dashRes.status);
    }

    console.log('\n✓ All protected routes accessible\n');
  } catch (err) {
    console.error('✗ Error:', err.message);
    if (err.response) {
      console.error('  Status:', err.response.status);
      console.error('  Data:', err.response.data);
    }
  }
}

testProtected();
