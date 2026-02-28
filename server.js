const { createServer } = require('http');
const { parse } = require('url');
const { randomUUID } = require('crypto');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// Execution event types that should be persisted
const LOGGABLE_EXEC_TYPES = new Set([
  'cue', 'next_block', 'prev_block', 'stop', 'reset_show',
  'cue_ack', 'error', 'block_changed', 'state',
]);

// Persist execution events to od_execution_log via Supabase REST
async function logExecution(showId, msg) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  const restUrl = process.env.POSTGREST_URL || `${supabaseUrl}/rest/v1`;
  try {
    await fetch(`${restUrl}/od_execution_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        show_id: showId,
        block_id: msg.payload?.blockId || null,
        element_id: msg.payload?.elementId || null,
        timestamp: msg.timestamp || new Date().toISOString(),
        seq: msg.seq || 0,
        idempotency_key: msg.idempotencyKey || randomUUID(),
        type: msg.type,
        source: msg.payload?.source || 'automator',
        vmix_command: msg.payload?.vmixCommand || null,
        vmix_response: msg.payload?.vmixResult || null,
        latency_ms: msg.payload?.latencyMs || null,
        metadata: msg.payload?.metadata || null,
      }),
    });
  } catch (err) {
    console.error('Execution log error:', err.message);
  }
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Per-show client tracking
const showClients = new Map(); // showId -> Set<ws>

function broadcast(showId, message, exclude) {
  const clients = showClients.get(showId);
  if (!clients) return;
  const data = typeof message === 'string' ? message : JSON.stringify(message);
  for (const client of clients) {
    if (client !== exclude && client.readyState === 1) {
      client.send(data);
    }
  }
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // CORS for Automator dev (different port)
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url, true);
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.showId = null;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON' } }));
        return;
      }

      // Join a show room
      if (msg.type === 'join') {
        const showId = msg.payload?.showId;
        if (!showId) {
          ws.send(JSON.stringify({ type: 'error', payload: { message: 'showId required' } }));
          return;
        }

        // Leave previous show if any
        if (ws.showId && showClients.has(ws.showId)) {
          showClients.get(ws.showId).delete(ws);
        }

        ws.showId = showId;
        if (!showClients.has(showId)) {
          showClients.set(showId, new Set());
        }
        showClients.get(showId).add(ws);

        ws.send(JSON.stringify({
          type: 'welcome',
          payload: {
            showId,
            clients: showClients.get(showId).size,
            serverTime: new Date().toISOString(),
          },
        }));
        return;
      }

      // Broadcast to same show (relay)
      if (ws.showId) {
        broadcast(ws.showId, msg, ws);

        // Persist execution events
        if (msg.channel === 'execution' && LOGGABLE_EXEC_TYPES.has(msg.type)) {
          logExecution(ws.showId, msg);
        }
      }
    });

    ws.on('close', () => {
      if (ws.showId && showClients.has(ws.showId)) {
        const clients = showClients.get(ws.showId);
        clients.delete(ws);
        if (clients.size === 0) {
          showClients.delete(ws.showId);
        }
      }
    });
  });

  // Heartbeat every 3 seconds
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 3000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  // Expose broadcast for API routes
  global.__wsBroadcast = broadcast;
  global.__wsShowClients = showClients;

  server.listen(port, hostname, () => {
    console.log(`> OpenDirector ready on http://${hostname}:${port}`);
    console.log(`> WebSocket available at ws://${hostname}:${port}/ws`);
  });
});
