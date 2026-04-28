import app from './app.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import './jobs/standup.job.js';

const PORT = process.env.PORT || 3000;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors:{
    origin:'http://localhost:3001'
  }
});

io.on('connection',(socket)=>{
  console.log('User connected');

  socket.on('join-project',(projectId)=>{
    socket.join(projectId);
  });

  socket.on('task-updated',(projectId,data)=>{
    io.to(projectId).emit(
      'task-updated',
      data
    );
  });

  socket.on('comment-added',(projectId,data)=>{
    io.to(projectId).emit(
      'comment-added',
      data
    );
  });

  socket.on('disconnect',()=>{
    console.log('User disconnected');
  });
});

io.on('connection', (socket) => {

  socket.on(
    'join-project',
    (projectId)=>{
      socket.join(projectId);
    }
  );

  socket.on(
    'send-message',
    (data)=>{
      io.to(data.projectId)
        .emit(
          'new-message',
          data
        );
    }
  );

  socket.on(
    'typing',
    (data)=>{
      socket.to(data.projectId)
        .emit(
          'typing',
          data.user
        );
    }
  );

});

httpServer.listen(PORT, ()=>{
  console.log(`Server running on ${PORT}`);
});
