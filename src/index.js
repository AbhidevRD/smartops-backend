import app from './app.js';

// Read port from .env file, or use 3000 as default
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
  console.log('');
  console.log('  SmartOps AI Backend Server');
  console.log('  Running on: http://localhost:' + PORT);
  console.log('  Press Ctrl+C to stop');
  console.log('');
});
