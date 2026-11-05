const http = require("node:http");

function createServer() {
  return http.createServer((_, res) => res.end("ok\n"));
}

module.exports = { createServer };

// Only listen when run directly, so tests can import this without opening a port.
if (require.main === module) {
  createServer().listen(8080);
}
