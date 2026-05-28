// =============================================================================
// server.js — INTERCEPT: Localized Dragnet
// =============================================================================
// Node.js bridge server. This is the connective tissue of the installation.
//
// RESPONSIBILITIES:
//   1. Serve the frontend (index.html + sketch.js) over HTTP
//   2. Accept WebSocket connections from both ESP32s and the browser
//   3. Aggregate ESP32 sensor data and forward it to the browser
//   4. Detect floppy disk insertion via filesystem polling and send
//      an 'init' event to the browser to start the game
//   5. On RETAIN vote: receive trigger from browser, send serial command
//      to Arduino Leonardo to fire the thermal printer
//
// CONNECTED CLIENTS:
//   - Browser (p5.js sketch)         identifies as { client: 'browser' }
//   - Operator ESP32 (physical panel) identifies as { client: 'esp32_operator' }
//   - Spotter ESP32 (optional buttons) identifies as { client: 'esp32_spotter' }
//   - Arduino Leonardo               connected via USB serial (not WebSocket)
//
// STARTUP:
//   npm install
//   node server.js
//   Open http://localhost:3000 in Chrome
// =============================================================================

const WebSocket   = require('ws');
const { SerialPort } = require('serialport');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');


// =============================================================================
// CONFIGURATION
// =============================================================================

const HTTP_PORT = 3000;   // Browser opens http://localhost:3000
const WS_PORT   = 8080;   // ESP32s and browser connect to ws://localhost:8080

// Arduino Leonardo serial port.
// macOS: something like /dev/cu.usbmodemXXXX — find with: ls /dev/cu.*
// Linux: typically /dev/ttyACM0
// Can also be set via environment variable: ARDUINO_PATH=/dev/cu.usbmodem1234 node server.js
const ARDUINO_PATH = process.env.ARDUINO_PATH || '/dev/ttyACM0';
const ARDUINO_BAUD = 9600;

// Floppy disk mount detection.
// macOS: watches /Volumes for any new mount — no need to know the disk's
//   label in advance. Format the disk before the installation:
//     diskutil list                          ← find /dev/diskN for the MPF-920
//     diskutil eraseDisk FAT32 INTERCEPT /dev/diskN
//   Label can be anything; the server detects whatever mounts.
// Linux: polls FLOPPY_PATH directly (env var or /media/floppy default).
//   Override: FLOPPY_PATH=/media/usb0 node server.js


// =============================================================================
// HTTP SERVER
// =============================================================================
// Serves files from the /public directory.
// index.html and sketch.js live there.

const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
};

const httpServer = http.createServer((req, res) => {
  // Default route → index.html
  const safePath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(__dirname, safePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
    res.end(data);
  });
});

httpServer.listen(HTTP_PORT, () =>
  console.log(`[HTTP]   Serving frontend at http://localhost:${HTTP_PORT}`)
);


// =============================================================================
// WEBSOCKET SERVER
// =============================================================================
// All real-time communication happens here. Three types of clients connect:
// the browser, the operator ESP32, and optionally the spotter ESP32.
//
// MESSAGE ROUTING:
//   ESP32 → bridge → browser  (sensor data forwarded to game)
//   browser → bridge → ESP32  (haptic commands forwarded to hardware)
//   browser → bridge → serial (RETAIN vote triggers printer)

const wss = new WebSocket.Server({ port: WS_PORT }, () =>
  console.log(`[WS]     Bridge listening on ws://localhost:${WS_PORT}`)
);

// References to connected clients (null if not connected)
let browserClient  = null;
let esp32Operator  = null;
let esp32Spotter   = null;

wss.on('connection', (ws) => {
  console.log('[WS]     New connection');

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return; }  // ignore non-JSON messages

    // ── Browser client messages ───────────────────────────────────────────
    if (msg.client === 'browser') {
      browserClient = ws;  // register/update reference

      // RETAIN vote: browser tells us to fire the printer
      if (msg.type === 'retain_trigger') {
        triggerPrinter(msg.content || '');
      }

      // Haptic intensity command: forward to operator ESP32
      // The game sends this every 50ms during a lock attempt
      if (msg.type === 'haptic') {
        forwardToClient(esp32Operator, {
          type:      'haptic',
          intensity: msg.intensity,  // 0.0 – 1.0
        });
      }
    }

    // ── Operator ESP32 messages ───────────────────────────────────────────
    if (msg.client === 'esp32_operator') {
      esp32Operator = ws;  // register/update reference
      // Forward all sensor data directly to the browser
      // (pot value, toggle state, button edges)
      forwardToClient(browserClient, msg);
    }

    // ── Spotter ESP32 messages (optional) ────────────────────────────────
    if (msg.client === 'esp32_spotter') {
      esp32Spotter = ws;
      forwardToClient(browserClient, msg);
    }
  });

  ws.on('close', () => {
    // Clear the reference when a client disconnects
    if (ws === browserClient) browserClient = null;
    if (ws === esp32Operator) esp32Operator = null;
    if (ws === esp32Spotter)  esp32Spotter  = null;
    console.log('[WS]     Connection closed');
  });

  ws.on('error', (e) => console.error('[WS]     Error:', e.message));
});

// Helper: safely send a JSON message to a WebSocket client
function forwardToClient(target, payload) {
  if (target && target.readyState === WebSocket.OPEN) {
    target.send(JSON.stringify(payload));
  }
}


// =============================================================================
// ARDUINO LEONARDO — SERIAL CONNECTION
// =============================================================================
// The Leonardo is dedicated to physical output: thermal printer and floppy.
// We communicate with it over USB serial using simple text commands.
//
// COMMAND FORMAT:
//   PRINT:<content>\n  → triggers the printer with the given content text
//   PING\n             → heartbeat check, Leonardo responds PONG
//
// If the Leonardo isn't connected, we log a warning and continue —
// the game runs fine without it (just no printer output).

let arduinoPort = null;

function initArduino() {
  arduinoPort = new SerialPort({
    path:     ARDUINO_PATH,
    baudRate: ARDUINO_BAUD,
    autoOpen: false,
  });

  arduinoPort.open((err) => {
    if (err) {
      console.warn(`[Serial]  Arduino not found at ${ARDUINO_PATH} — printer disabled`);
      arduinoPort = null;
      return;
    }
    console.log(`[Serial]  Arduino Leonardo connected at ${ARDUINO_PATH}`);

    // Log anything the Leonardo sends back (ACKs, debug output)
    arduinoPort.on('data', (d) =>
      console.log('[Serial]  Arduino:', d.toString().trim())
    );
  });
}

// Send a PRINT command to the Leonardo.
// Called when the browser reports a RETAIN vote.
function triggerPrinter(content) {
  if (!arduinoPort || !arduinoPort.isOpen) {
    console.log('[Serial]  Printer trigger skipped — Arduino not connected');
    return;
  }
  const cmd = `PRINT:${content}\n`;
  arduinoPort.write(cmd, (err) => {
    if (err) console.error('[Serial]  Write error:', err.message);
    else     console.log('[Serial]  PRINT command sent →', content.substring(0, 40));
  });
}

initArduino();


// =============================================================================
// FLOPPY DISK DETECTION
// =============================================================================
// The Sony MPF-920 mounts as a standard USB mass storage volume.
// macOS: we snapshot /Volumes at startup and poll for any new entry —
//   this way the disk's label doesn't matter.
// Linux: falls back to polling a specific mount path.
// Either way, detecting the mount sends { type: 'init' } to the browser,
// which starts the game. SPACE in the browser does the same (demo mode).

let floppyDetected = false;

if (process.platform === 'darwin') {
  // Snapshot what's already mounted so we don't false-trigger on startup
  let knownVolumes;
  try {
    knownVolumes = new Set(fs.readdirSync('/Volumes'));
  } catch {
    knownVolumes = new Set();
  }
  console.log(`[Floppy]  Watching /Volumes for new mount (${knownVolumes.size} volumes already known)`);

  const floppyPoll = setInterval(() => {
    if (floppyDetected) return;
    try {
      const current = fs.readdirSync('/Volumes');
      for (const vol of current) {
        if (!knownVolumes.has(vol)) {
          floppyDetected = true;
          clearInterval(floppyPoll);
          console.log(`[Floppy]  New volume mounted: /Volumes/${vol} — sending init`);
          forwardToClient(browserClient, { type: 'init' });
          return;
        }
      }
    } catch { /* /Volumes briefly inaccessible — retry next poll */ }
  }, 500);

} else {
  const FLOPPY_PATH = process.env.FLOPPY_PATH || '/media/floppy';
  console.log(`[Floppy]  Watching for disk at ${FLOPPY_PATH}`);

  const floppyPoll = setInterval(() => {
    if (floppyDetected) return;
    if (fs.existsSync(FLOPPY_PATH)) {
      floppyDetected = true;
      clearInterval(floppyPoll);
      console.log(`[Floppy]  Disk detected at ${FLOPPY_PATH} — sending init`);
      forwardToClient(browserClient, { type: 'init' });
    }
  }, 500);
}
console.log('[Ready]   INTERCEPT bridge online. Open http://localhost:3000 in Chrome.');
