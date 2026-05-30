import 'dotenv/config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

console.log('\n╔════════════════════════════════════════╗');
console.log('║    Database Connection Diagnostic      ║');
console.log('╚════════════════════════════════════════╝\n');

// Parse DATABASE_URL
const dbUrl = process.env.DATABASE_URL;
console.log('📋 Configuration Check:');
console.log(`   DATABASE_URL set: ${!!dbUrl}`);
console.log(`   URL: ${dbUrl?.substring(0, 80)}...`);

if (!dbUrl) {
  console.error('\n❌ ERROR: DATABASE_URL not configured in .env');
  process.exit(1);
}

// Extract connection details
const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):(.+)@([^:]+):(\d+)\/(.+)/);
if (!urlMatch) {
  console.error('\n❌ ERROR: Invalid DATABASE_URL format');
  process.exit(1);
}

const [, user, pass, host, port, database] = urlMatch;

console.log('\n🔍 Connection Details Extracted:');
console.log(`   User: ${user}`);
console.log(`   Host: ${host}`);
console.log(`   Port: ${port}`);
console.log(`   Database: ${database}`);
console.log(`   Password length: ${pass.length} chars`);

// Test network connectivity
console.log('\n🌐 Testing Network Connectivity...');
try {
  // Use PowerShell's Test-NetConnection (Windows)
  const { stdout } = await execPromise(`powershell -Command "Test-NetConnection -ComputerName ${host} -Port ${port} -WarningAction SilentlyContinue | Select-Object -Property ComputerName, RemotePort, TcpTestSucceeded | ConvertTo-Json"`);
  const result = JSON.parse(stdout);
  
  if (result.TcpTestSucceeded) {
    console.log(`   ✓ Can reach ${host}:${port}`);
  } else {
    console.error(`   ✗ Cannot reach ${host}:${port}`);
    console.error('   → Check firewall, VPN, or Supabase IP restrictions');
  }
} catch (error) {
  console.warn(`   ⚠️  Could not test connection (platform issue): ${error.message}`);
}

// Try direct psql connection (if available)
console.log('\n🔐 Attempting PostgreSQL Connection...');
try {
  const psqlCmd = `psql -h ${host} -p ${port} -U ${user} -d ${database} -c "SELECT version();" --no-password`;
  const { stdout, stderr } = await execPromise(psqlCmd, { env: { ...process.env, PGPASSWORD: pass } });
  
  if (stdout) {
    console.log('   ✓ PostgreSQL connection successful!');
    console.log(`   Version: ${stdout.split('\n')[0]}`);
  }
} catch (error) {
  if (error.message.includes('psql') && error.message.includes('not found')) {
    console.warn('   ⚠️  PostgreSQL client (psql) not installed - skipping direct test');
  } else {
    console.error(`   ✗ Connection failed: ${error.stderr || error.message}`);
  }
}

// Test with Prisma
console.log('\n📦 Testing with Prisma Client...');
try {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  const result = await prisma.$queryRaw`SELECT 1 as connected`;
  console.log('   ✓ Prisma connection successful!');
  await prisma.$disconnect();
} catch (error) {
  console.error(`   ✗ Prisma error: ${error.message}`);
  
  if (error.message.includes('ENOTFOUND')) {
    console.error('   → DNS resolution failed - host not found');
  } else if (error.message.includes('ECONNREFUSED')) {
    console.error('   → Connection refused - port not open');
  } else if (error.message.includes('ETIMEDOUT')) {
    console.error('   → Connection timeout - host unreachable');
  } else if (error.message.includes('password authentication failed')) {
    console.error('   → Wrong credentials');
  }
}

console.log('\n📝 Troubleshooting Steps:');
console.log('   1. Verify Supabase project is running: https://app.supabase.com/');
console.log('   2. Check IP restrictions in Supabase Database Settings');
console.log('   3. Ensure DATABASE_URL credentials are correct');
console.log('   4. Check firewall/VPN settings');
console.log('   5. Try connecting from Supabase SQL Editor to verify DB is up');
console.log('   6. Verify internet connectivity: ping 8.8.8.8\n');
