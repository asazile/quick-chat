// quick-chat server: minimal real-time chat over WebSocket
// No persistence, no auth. Just relay messages between connected clients.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// Serve the static frontend from /public
const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);
  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
  };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain; charset=utf-8' });
    res.end(data);
  });
});

// WebSocket server, share the same HTTP server
const wss = new WebSocketServer({ server });

const clients = new Map(); // ws -> { name }

wss.on('connection', (ws) => {
  let name = `用户${Math.floor(Math.random() * 9000) + 1000}`;
  clients.set(ws, { name });
  broadcast({
    type: 'system',
    text: `${name} 加入了房间（当前 ${clients.size} 人在线）`,
    online: clients.size,
  });
  // Send current online count to the newcomer
  ws.send(JSON.stringify({ type: 'system', text: `欢迎，${name}！你的昵称可在右上方修改。`, online: clients.size }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'rename' && typeof msg.name === 'string') {
      const next = msg.name.trim().slice(0, 20) || name;
      const old = name;
      name = next;
      clients.set(ws, { name });
      broadcast({ type: 'system', text: `${old} 改名为 ${next}`, online: clients.size });
      ws.send(JSON.stringify({ type: 'rename-ok', name }));
      return;
    }
    if (msg.type === 'message' && typeof msg.text === 'string') {
      broadcast({ type: 'message', name, text: msg.text.slice(0, 1000), ts: Date.now() });
    }
  });

  ws.on('close', () => {
    const meta = clients.get(ws);
    clients.delete(ws);
    broadcast({ type: 'system', text: `${meta?.name || name} 离开了房间（当前 ${clients.size} 人在线）`, online: clients.size });
  });

  function broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const client of clients.keys()) {
      if (client.readyState === ws.OPEN) client.send(data);
    }
  }
});

server.listen(PORT, () => {
  console.log(`quick-chat listening on http://localhost:${PORT}`);
});
