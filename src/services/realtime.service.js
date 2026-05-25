let socketServer = null;

export function setSocketServer(io) {
  socketServer = io;
}

export function getSocketServer() {
  return socketServer;
}

export function emitToProject(projectId, event, data) {
  if (!socketServer || !projectId) {
    return;
  }

  socketServer.to(projectId).emit(event, data);
}
