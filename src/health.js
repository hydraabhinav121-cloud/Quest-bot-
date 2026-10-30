import http from 'node:http';

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[health] listening on ${PORT}`);
});

server.on('error', (e) => console.log('[health] error', e.message));

const url = process.env.KEEPALIVE_URL;
if (url) {
  setInterval(() => {
    fetch(url).catch(() => {});
  }, 10 * 60 * 1000);
  console.log('[health] self keep-alive on');
}
