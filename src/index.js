import 'dotenv/config';
import app from './app.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import './jobs/standup.job.js';
import './jobs/deadline.job.js';
import { setSocketServer } from './services/realtime.service.js';
import { requireProjectMember } from './utils/projectAccess.js';
import { verifyAuthToken } from './utils/authToken.js';
import prisma from './lib/prisma.js';

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// Startup database validation
function validateStartupConfig() {
  const dbUrl = process.env.DATABASE_URL;
  
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║      SmartOps Backend Starting         ║');
  console.log('╚════════════════════════════════════════╝\n');

  if (dbUrl?.includes('sqlite') || dbUrl?.includes('file:')) {
    console.error('❌ ERROR: SQLite database detected!');
    console.error('DATABASE_URL contains SQLite reference.');
    console.error('Please configure Supabase PostgreSQL in .env');
    process.exit(1);
  }

  if (dbUrl?.includes('postgresql://') || dbUrl?.includes('postgres://')) {
    console.log('✓ Database Type: PostgreSQL (Supabase)');
  } else {
    console.error('❌ ERROR: Unknown database type');
    console.error('DATABASE_URL must be a PostgreSQL connection string');
    process.exit(1);
  }

  console.log('✓ Configuration: Valid');
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ Frontend URL: ${FRONTEND_URL}`);
  console.log('');
}

validateStartupConfig();

console.log('Active DATABASE_URL:', process.env.DATABASE_URL?.slice(0, 200));

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors:{
    origin: FRONTEND_URL,
    credentials: true
  }
});

setSocketServer(io);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Socket authentication required'));
    }

    socket.user = await verifyAuthToken(token);
    return next();
  } catch (error) {
    return next(new Error(error.message || 'Invalid socket token'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user?.id}`);

  // Auto-join user's personal room for targeted notifications
  if (socket.user?.id) {
    socket.join(`user:${socket.user.id}`);
  }

  socket.on('join-project', async (projectId, callback) => {
    try {
      console.log(`[Socket] User ${socket.user?.id} (${socket.user?.email}) attempting to join project ${projectId}`);
      await requireProjectMember(projectId, socket.user);
      socket.join(projectId);
      console.log(`[Socket] User ${socket.user?.id} joined room ${projectId}`);
      callback?.({ success: true });
    } catch (error) {
      console.error(`[Socket] Join failed for ${projectId}:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });

  socket.on('leave-project', (projectId) => {
    socket.leave(projectId);
  });

  socket.on('task-updated', async ({ projectId, data }, callback) => {
    try {
      await requireProjectMember(projectId, socket.user);
      socket.to(projectId).emit('task-updated', data);
      callback?.({ success: true });
    } catch (error) {
      callback?.({ success: false, error: error.message });
    }
  });

  socket.on('send-message', async (data, callback) => {
    try {
      await requireProjectMember(data.projectId, socket.user);
      socket.to(data.projectId).emit('message-sent', data);
      socket.to(data.projectId).emit('new-message', data);
      callback?.({ success: true });
    } catch (error) {
      callback?.({ success: false, error: error.message });
    }
  });

  socket.on('send-file-message', async (data, callback) => {
    try {
      await requireProjectMember(data.projectId, socket.user);
      // Broadcast the file message to all other room members
      socket.to(data.projectId).emit('message-sent', data);
      socket.to(data.projectId).emit('new-message', data);
      callback?.({ success: true });
    } catch (error) {
      callback?.({ success: false, error: error.message });
    }
  });

  socket.on('typing', async (data) => {
    try {
      await requireProjectMember(data.projectId, socket.user);
      socket.to(data.projectId).emit('typing', data.user || socket.user.email);
    } catch {
      // Ignore unauthorized typing events.
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user?.id}`);
  });
});

httpServer.listen(PORT, ()=>{
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ WebSocket server ready for real-time updates`);
  console.log(`✓ All systems initialized\n`);
});
