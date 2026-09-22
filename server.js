const { createServer } = require('./app');

const PORT = process.env.PORT || 3000;
const server = createServer();

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
