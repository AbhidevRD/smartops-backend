const { Pool } = require('pg');
const pool = new Pool({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.icjhbzdyjojidyjpyhaf',
  password: 'Abhidev@200',
  database: 'postgres'
});
pool.query(`
  SELECT u.id, ot.tokenHash FROM users u 
  JOIN otp_tokens ot ON u.id = ot.userId 
  WHERE u.email = 'testuser@example.com' 
  AND ot.used = false 
  AND ot.type = 'EMAIL_VERIFY' 
  ORDER BY ot.createdAt DESC LIMIT 1;
`, (err, res) => {
  if (err) console.error('Error:', err);
  else console.log(JSON.stringify(res.rows, null, 2));
  pool.end();
});
