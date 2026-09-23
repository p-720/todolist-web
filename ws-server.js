import { WebSocketServer } from 'ws';

let wss = null;
let currentTimerState = {
  activeHabitId: null,
  mode: 'stopwatch',
  elapsed: 0,
  running: false,
  startTime: null,
  elapsedBefore: 0,
};

export function initWebSocket(server, basePath = '/pomotask') {
  const wsPath = basePath + '/ws';
  wss = new WebSocketServer({ server, path: wsPath });

  wss.on('connection', (ws) => {
    // Send current timer state to new client
    ws.send(JSON.stringify({ type: 'timer:sync', data: currentTimerState }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleMessage(msg);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    });
  });

  return wss;
}

function handleMessage(msg) {
  if (msg.type === 'ping') return; // Keepalive, don't relay
  if (msg.type?.startsWith('timer:')) {
    // A bare `timer:stop` (rofi / polybar / phone picker) carries no data.
    // Normalize it to a full stopped state: otherwise the server's truth
    // stays "running" forever when no web client is connected to echo the
    // stop, and every new client is synced a stale running timer.
    if (msg.type === 'timer:stop' && !msg.data) {
      msg = {
        ...msg,
        data: {
          activeHabitId: null,
          running: false,
          elapsed: 0,
          startTime: null,
          elapsedBefore: 0,
          name: null,
        },
      };
    }
    currentTimerState = { ...currentTimerState, ...msg.data };
  }
  // Relay to all connected clients (including sender, sender filters own echo)
  broadcast(msg);
}

function broadcast(msg) {
  if (!wss) return;
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}
