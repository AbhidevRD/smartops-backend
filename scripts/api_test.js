import axios from 'axios';

const base = 'http://localhost:3000';

function log(title, data){
  console.log('\n=== ' + title + ' ===');
  console.log(typeof data === 'string' ? data : JSON.stringify(data,null,2));
}

async function run(){
  try{
    const root = await axios.get(base + '/');
    log('ROOT', root.data);

    const db = await axios.get(base + '/test-db');
    log('TEST-DB', db.data);

    const email = `apitest+${Date.now()}@example.com`;

    const signup = await axios.post(base + '/api/auth/signup', {
      name: 'API Tester',
      email,
      password: 'TestPass123'
    }, { headers: { 'Content-Type': 'application/json' } });

    log('SIGNUP', signup.data);

    const otp = signup.data.otp;
    if(!otp){
      console.warn('No OTP returned by signup; cannot continue OTP flow.');
      return;
    }

    const verify = await axios.post(base + '/api/auth/verify-otp', {
      email,
      otp
    });
    log('VERIFY-OTP', verify.data);

    const login = await axios.post(base + '/api/auth/login', { email, password: 'TestPass123' });
    log('LOGIN', login.data);

    const token = login.data.token;
    log('TOKEN', token ? token.slice(0,20) + '...' : token);

  }catch(err){
    if(err.response){
      log('ERROR RESPONSE', err.response.data);
    } else {
      console.error('ERROR', err.message);
    }
    process.exit(1);
  }
}

run();
