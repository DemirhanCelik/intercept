// =============================================================================
// sketch.js — INTERCEPT: Localized Dragnet
// =============================================================================
// Main game file. Runs in the browser using p5.js for rendering and ml5.js
// for computer vision (HandPose gesture detection).
//
// HOW IT FITS INTO THE SYSTEM:
//   1. Node.js server (server.js) aggregates input from the ESP32 hardware
//      panel and forwards it here via WebSocket.
//   2. This sketch handles ALL game logic, rendering, and ML.
//   3. When a RETAIN vote passes, this sketch tells server.js to trigger
//      the Arduino Leonardo → thermal printer chain.
//
// TWO CONTROLLERS:
//   Controller 1 — Physical panel (ESP32): potentiometer, toggle, buttons
//   Controller 2 — ml5 HandPose (webcam): hand gesture tracking
//
// AESTHETIC: Option B — The Silicon Valley Dragnet
//   Clean, white, sterile. Looks like a corporate data operations dashboard.
//   The violence of surveillance is hidden behind good UX design.
//   The horror is how normal it feels.
// =============================================================================


// =============================================================================
// CORPORATE DESIGN SYSTEM
// =============================================================================
// All colors, fonts, and spacing defined here so the aesthetic stays
// consistent across every draw function. Change values here to retheme.

const THEME = {
  // Backgrounds
  bgPage: '#F0F2F5',   // outer page background (light gray)
  bgPanel: '#FFFFFF',   // card/panel background (white)
  bgPanelAlt: '#F8F9FA',   // slightly off-white for alternate panels

  // Brand / accent
  blue: '#1B4FD8',   // primary accent — Palantir-ish blue
  blueLight: '#EFF6FF',   // pale blue fill for badges
  blueMid: '#BFDBFE',   // blue border color
  blueDim: '#93C5FD',   // muted blue text

  // Semantic colors
  danger: '#DC2626',   // red — alerts, PURGE, high surveillance
  dangerLight: '#FEF2F2',   // pale red fill
  success: '#16A34A',   // green — confirmed locks, RETAIN
  successLight: '#F0FDF4',

  // Text
  textPrimary: '#111827', // near-black body text
  textSecondary: '#6B7280', // gray metadata / labels
  textTertiary: '#9CA3AF', // light gray — fine print
  textDisabled: '#D1D5DB', // very light — deemphasized

  // Borders / dividers
  border: '#E5E7EB',   // standard divider
  borderLight: '#F3F4F6',   // subtle divider

  // Signal / network map
  nodeColor: '#1B4FD8',   // network nodes (blue dots)
  edgeColor: '#E5E7EB',   // network edges (light gray lines)
  signalColor: '#F59E0B',   // active signal marker (amber — stands out)
};

// Typography — p5.js textFont() only takes a CSS font string
const FONT_SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const FONT_MONO = 'Courier New, Courier, monospace';


// =============================================================================
// GAME STATE MACHINE
// =============================================================================
// The game moves through these states in order. STATE controls what gets
// drawn each frame and what inputs are accepted.
//
//  IDLE → HUNT → LOCK_ATTEMPT → INTERCEPT_SUCCESS → VOTE → CONSEQUENCE
//    ↑                                                          |
//    └──────────────── (loop or DEBRIEF at 10 intercepts) ─────┘

const STATE = {
  IDLE: 'idle',              // waiting for floppy / SPACE
  HUNT: 'hunt',              // Spotter + Operator searching
  LOCK_ATTEMPT: 'lock_attempt',      // two-finger lock + freq match
  INTERCEPT_SUCCESS: 'intercept_success', // data reveal animation
  VOTE: 'vote',              // RETAIN / PURGE decision
  CONSEQUENCE: 'consequence',       // result + handler warning
  DEBRIEF: 'debrief',           // end-of-session summary
};

let state = STATE.IDLE;


// =============================================================================
// SESSION STATE
// =============================================================================
// Tracks all metrics for the current play session. Reset on new game.

let session = {
  interceptCount: 0,    // total successful intercepts
  retainCount: 0,    // how many times RETAIN was voted
  purgeCount: 0,    // how many times PURGE was voted
  surveillanceIndex: 0,    // 0–100, climbs with each RETAIN vote
  consecutivePurges: 0,    // triggers federal handler warning at 3
  contractorScore: 100,  // compliance score, drops with each PURGE
  lastVote: null, // 'RETAIN' or 'PURGE' — used by consequence screen
};


// =============================================================================
// NETWORK MAP
// =============================================================================
// The background visualization — a stylized network graph representing
// the Pacific Northwest data corridor. Nodes are data centers; edges are
// transmission paths between them.

let nodes = [];   // array of { id, x, y, phase } objects
let edges = [];   // array of { a, b } index pairs

// Active signal — the thing both players are trying to intercept
let signalPos = { x: 0, y: 0 };   // current rendered position
let signalTarget = { x: 0, y: 0 };   // node it's drifting toward
let targetFreq = 50;               // 0–100, Operator must match with pot
let currentTx = null;             // current transmission object (see TRANSMISSIONS)
let signalDriftTimer = 0;            // counts up until signal picks a new target node

// Spotter scan/reveal mechanic
// 0 = hidden/noisy, 1 = fully revealed
let signalReveal = 0.25;

const SCAN_RADIUS = 170;  // open palm can find signal from farther away
const TARGET_RADIUS = 75;   // one finger keeps signal stable/revealed
const LOCK_RADIUS = 75;   // two fingers can lock only when close


// =============================================================================
// TRANSMISSION LIBRARY
// =============================================================================
// The content players intercept. Ordered from institutional to civilian.
// The game selects from this pool based on session.interceptCount —
// early intercepts look like routine data, later ones are unmistakably personal.
// Players are never told the content is changing. The mechanics stay identical.

const TRANSMISSIONS = [
  // Intercepts 1–4: looks like normal institutional traffic
  { type: 'DATA', content: 'Routing packet #4471 — institutional origin', civilian: false },
  { type: 'ENCRYPTED', content: 'Encrypted payload — classification: PENDING', civilian: false },
  { type: 'VOICE', content: 'Metadata bundle — network infrastructure node', civilian: false },
  { type: 'DATA', content: 'Traffic log — South Lake Union datacenter relay', civilian: false },

  // Intercepts 5–8: ambiguous — could be either
  { type: 'DATA', content: 'Transaction: $34.50 — Pike Place Market, 11:02 PM', civilian: true },
  { type: 'VOICE', content: 'Location ping — Capitol Hill, 11:43 PM', civilian: true },
  { type: 'DATA', content: 'Search query: "urgent care open near me"', civilian: true },
  { type: 'VOICE', content: 'Text message: "are you safe? haven\'t heard from you"', civilian: true },

  // Intercepts 9+: unmistakably personal civilian data
  { type: 'DATA', content: 'Transit swipe — Link Light Rail, UW Station, 12:14 AM', civilian: true },
  { type: 'ENCRYPTED', content: 'Medical query: prescription refill — recurring', civilian: true },
  { type: 'VOICE', content: 'Call log — duration 0:23 — unregistered recipient', civilian: true },
  { type: 'DATA', content: 'Location history — 14 waypoints, 6-hour window', civilian: true },
];


// Scrolling data ticker shown on the idle attract screen
const TICKER_TEXT =
  '  NODE N00 ACTIVE  ·  ROUTING PKT#4471  ·  ORIGIN: MASKED  ·  DEST: FED-RELAY-01  ·  CLASSIFICATION: PENDING  ·  ' +
  '  NODE N07 NOMINAL  ·  TRANSMISSION RATE: 1.2 Gbps  ·  INTERCEPT QUEUE: READY  ·  ' +
  '  SOUTH LAKE UNION DATACENTER  ·  OPERATOR SESSION: UNINITIALIZED  ·  INSERT CREDENTIAL TO INITIALIZE  ·  ' +
  '  FEDERAL RELAY STATUS: ONLINE  ·  AES-256 ENCRYPTION ACTIVE  ·  RETENTION POLICY: ENGAGED  ·  ';


// =============================================================================
// ML5 HANDPOSE — CONTROLLER 2 (SPOTTER)
// =============================================================================
// *** THIS SECTION IS FOR YOUR IMPLEMENTATION ***
//
// ml5.handPose() runs a pre-trained TensorFlow.js model in the browser.
// It takes a webcam feed and returns 21 keypoints per detected hand,
// updated every frame automatically once detectStart() is called.
//
// KEYPOINT INDEX REFERENCE — full hand skeleton:
//   0  = wrist
//   1  = thumb CMC    2  = thumb MCP    3  = thumb IP     4  = thumb tip
//   5  = index MCP    6  = index PIP    7  = index DIP    8  = index tip
//   9  = middle MCP   10 = middle PIP   11 = middle DIP   12 = middle tip
//   13 = ring MCP     14 = ring PIP     15 = ring DIP     16 = ring tip
//   17 = pinky MCP    18 = pinky PIP    19 = pinky DIP    20 = pinky tip
//
// Each keypoint has: { x, y, z, score, name }
//   x, y  → pixel position in the VIDEO frame (not the canvas)
//   score → confidence 0.0–1.0
//
// COORDINATE MAPPING:
//   Video is 320x240. Canvas is 1280x720.
//   To map a keypoint onto the canvas:
//     const canvasX = map(kp[8].x, 0, video.width,  0, width);
//     const canvasY = map(kp[8].y, 0, video.height, 0, height);
//   Use lerp() to smooth out tracking jitter:
//     sweepPos.x = lerp(sweepPos.x, canvasX, 0.25);
//
// WHAT THE GAME NEEDS FROM YOUR IMPLEMENTATION:
//   1. `gesture` — set this string every frame in updateGesture() to one of:
//        'scan'   → wide passive sweep (open palm suggested)
//        'target' → precision cursor (single pointing finger suggested)
//        'lock'   → triggers intercept attempt when cursor is over signal
//        'none'   → no hand detected or unrecognized pose
//
//   2. `sweepPos` — update sweepPos.x and sweepPos.y every frame to the
//        canvas-space position of the Spotter's fingertip (or palm center).
//        This is compared against signalPos to detect cursor overlap.
//
// THE LOCK TRIGGER (already wired — just set gesture correctly):
//   In drawHuntPhase(), the game already checks:
//     if (gesture === 'lock') {
//       const d = dist(sweepPos.x, sweepPos.y, signalPos.x, signalPos.y);
//       if (d < 65) → enter LOCK_ATTEMPT state
//     }
//   The 65px threshold is tunable — increase it to make locking easier.
//
// SUGGESTED FINGER-UP DETECTION APPROACH:
//   A finger is "up" if its tip y-value is significantly less than
//   its MCP (knuckle) y-value. Lower y = higher on screen in p5:
//     const fingerUp = (tipIdx, mcpIdx) => kp[tipIdx].y < kp[mcpIdx].y - 20;
//   Classify based on which combination of fingers are extended.

let handPose;         // ml5 handPose model instance — initialized in preload()
let video;            // p5 video capture element — initialized in setup()
let hands = [];      // array of detected hand objects — populated by detectStart()
let gesture = 'none'; // ← YOUR CODE sets this every frame in updateGesture()

// sweepPos: Spotter cursor position in canvas space (0–1280, 0–720)
// YOUR CODE updates this every frame in updateGesture()
let sweepPos = { x: 400, y: 360 };


// =============================================================================
// OPERATOR INPUT — ESP32 VIA WEBSOCKET
// =============================================================================
// The Node.js bridge forwards JSON packets from the ESP32 here.
// operatorData is updated every ~50ms when hardware is connected.
// Falls back gracefully to all-zero values in demo mode (no hardware).

let operatorData = {
  pot: 0,      // potentiometer reading, 0–4095 (12-bit ADC)
  toggle: false,  // toggle switch state — true = thrown
  retain: false,  // RETAIN button rising edge — true for one packet only
  purge: false,  // PURGE button rising edge — true for one packet only
};

let ws;  // WebSocket connection to Node.js bridge


// =============================================================================
// LOCK MECHANICS
// =============================================================================
// A successful intercept requires TWO conditions met simultaneously
// within the LOCK_FRAMES countdown:
//   1. Spotter holds two-finger lock gesture over the signal dot
//   2. Operator's pot reading is within FREQ_TOLERANCE of targetFreq
//      AND toggle switch is thrown

const LOCK_FRAMES = 180;   // 3 seconds at 60fps to complete lock
const FREQ_TOLERANCE = 8;     // how close pot value must be to target (0–100 scale)
let lockCountdown = 0;     // counts down from LOCK_FRAMES


// =============================================================================
// VOTE / CONSEQUENCE TIMING
// =============================================================================

const VOTE_FRAMES = 300;  // 5 seconds before auto-retain
let voteTimer = 0;

const CONSEQUENCE_FRAMES = 150;  // how long consequence screen shows
let consequenceTimer = 0;


// =============================================================================
// ANIMATION STATE
// =============================================================================

let revealAlpha = 0;  // fade-in alpha for the intercept reveal card (0–255)
let tickerOffset = 0;  // x position of the idle-screen scrolling data ticker


// =============================================================================
// PRELOAD
// =============================================================================
// p5.js calls preload() before setup(). We initialize the ml5 model here
// so it's ready by the time the game starts.

function preload() {
  // flipped: true mirrors the video so gestures feel natural
  // (otherwise left/right are inverted relative to what the player sees)
  handPose = ml5.handPose({ flipped: true });
}


// =============================================================================
// SETUP
// =============================================================================
// Runs once when the page loads. Initializes canvas, video, and connections.

function setup() {
  createCanvas(1280, 720);
  frameRate(60);

  // Video capture for HandPose
  // hide() prevents the raw <video> element from rendering on top of the canvas
  video = createCapture(VIDEO);
  video.size(320, 240);
  video.hide();

  // Start HandPose detection loop — calls the callback every frame
  // Results are stored in the global `hands` array
  handPose.detectStart(video, (results) => {
    hands = results;
  });

  buildNetwork();
  connectWebSocket();
}


// =============================================================================
// NETWORK MAP BUILDER
// =============================================================================
// Creates the node and edge arrays that make up the background graph.
// Called once in setup(). Positions are hand-tuned to look like a
// real infrastructure map without overlapping.

function buildNetwork() {
  const positions = [
    { x: 180, y: 140 }, { x: 400, y: 90 }, { x: 650, y: 160 },
    { x: 870, y: 110 }, { x: 140, y: 360 }, { x: 380, y: 300 },
    { x: 620, y: 380 }, { x: 840, y: 330 }, { x: 280, y: 540 },
    { x: 570, y: 530 }, { x: 790, y: 500 }, { x: 1020, y: 280 },
  ];

  nodes = positions.map((p, i) => ({
    id: i,
    x: p.x,
    y: p.y,
    phase: random(TWO_PI),  // random phase offset for subtle pulse animation
  }));

  // Edge list — which nodes are connected to which
  const pairs = [
    [0, 1], [1, 2], [2, 3], [3, 11], [4, 5], [5, 6], [6, 7], [7, 11],
    [0, 4], [1, 5], [2, 6], [3, 7], [5, 9], [6, 10], [8, 9], [9, 10], [10, 11], [4, 8],
  ];
  edges = pairs.map(([a, b]) => ({ a, b }));
}


// =============================================================================
// WEBSOCKET CONNECTION
// =============================================================================
// Connects to the Node.js bridge server running on localhost:8080.
// Handles three message types:
//   'init'          — floppy disk detected, start the game
//   'esp32_operator' — sensor data from the physical panel
//   'haptic'        — (sent by us, not received — see handleVote)
//
// Auto-reconnects every 2 seconds if connection drops.

function connectWebSocket() {
  ws = new WebSocket('ws://localhost:8080');

  ws.onopen = () => {
    console.log('[WS] Connected to bridge');
    // Register this client as the browser so server knows where to route data
    ws.send(JSON.stringify({ client: 'browser', type: 'hello' }));
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); }
    catch { return; }  // ignore malformed packets

    // ── Floppy disk init signal ───────────────────────────────────────────
    // Server sends this when fs.watch() detects the floppy drive mounting
    if (msg.type === 'init' && state === STATE.IDLE) {
      state = STATE.HUNT;
      spawnSignal();
    }

    // ── ESP32 Operator panel data ─────────────────────────────────────────
    // Arrives every ~50ms with pot value, toggle state, button edges
    if (msg.client === 'esp32_operator') {
      operatorData = msg;

      // While a lock is being attempted, send haptic feedback intensity
      // back to the ESP32 so the motor vibrates harder as freq gets closer
      if (state === STATE.LOCK_ATTEMPT) {
        const potFreq = map(msg.pot, 0, 4095, 0, 100); // convert to 0–100 scale
        const diff = abs(potFreq - targetFreq);
        const intensity = map(diff, 0, 40, 1.0, 0.0, true); // closer = stronger
        ws.send(JSON.stringify({
          client: 'browser',
          type: 'haptic',
          intensity,
        }));
      }

      // Hardware vote buttons — only fire on rising edge (one packet)
      if (state === STATE.VOTE) {
        if (msg.retain) handleVote('RETAIN');
        if (msg.purge) handleVote('PURGE');
      }
    }
  };

  // Auto-reconnect if bridge disconnects (e.g. server restart)
  ws.onclose = () => setTimeout(connectWebSocket, 2000);
  ws.onerror = (e) => console.warn('[WS] Error:', e);
}


// =============================================================================
// SPAWN SIGNAL
// =============================================================================
// Places a new active signal on the network map and picks a target frequency
// and transmission content for the Operator to intercept.
// Called at the start of each round.

function spawnSignal() {
  // Start the signal at a random node
  const idx = floor(random(nodes.length));
  signalPos = { x: nodes[idx].x, y: nodes[idx].y };
  signalTarget = { x: nodes[idx].x, y: nodes[idx].y };
  signalDriftTimer = 0;

  // Random frequency target — Operator must tune pot to this value
  targetFreq = floor(random(15, 85));

  // Select transmission content based on how far into the session we are.
  // This is the core narrative mechanic: early intercepts look institutional,
  // later ones are unmistakably civilian. Players are never told this changes.
  let pool;
  if (session.interceptCount < 4) pool = TRANSMISSIONS.filter(t => !t.civilian);
  else if (session.interceptCount < 8) pool = TRANSMISSIONS;
  else pool = TRANSMISSIONS.filter(t => t.civilian);

  currentTx = random(pool);
  // New signal starts mostly hidden.
  // Spotter must scan to reveal it again.
  signalReveal = 0.25;
}


// =============================================================================
// MAIN DRAW LOOP
// =============================================================================
// p5.js calls draw() 60 times per second. This is the game loop.
// All rendering and per-frame logic lives here or in functions called from here.

function draw() {
  // Corporate aesthetic: white/light background instead of dark
  background(THEME.bgPage);

  // These run every frame regardless of game state
  updateGesture();       // process webcam → gesture classification
  updateSignalDrift();   // move the active signal around the map

  // Route to the correct draw function for the current state
  switch (state) {
    case STATE.IDLE:
      drawIdle();
      break;

    case STATE.HUNT:
      drawHuntPhase();
      break;

    case STATE.LOCK_ATTEMPT:
      drawHuntPhase();     // keep the map + signal visible underneath
      drawLockAttempt();   // overlay the lock progress UI on top
      break;

    case STATE.INTERCEPT_SUCCESS:
      drawInterceptReveal();
      break;

    case STATE.VOTE:
      drawVoteScreen();
      break;

    case STATE.CONSEQUENCE:
      drawConsequenceScreen();
      break;

    case STATE.DEBRIEF:
      drawDebrief();
      break;
  }

  // These always render on top of everything else
  drawSpotterOverlay();  // webcam feed + hand landmarks (bottom-left corner)
  drawHUD();             // top status bar
}


// =============================================================================
// SIGNAL DRIFT
// =============================================================================
// Moves the active signal slowly between nodes on the network map.
// Speed and drift interval both scale with session.interceptCount —
// early game the signal is slow and easy to track; late game it's fast
// and targets multiple nodes before players can lock on.

function updateSignalDrift() {
  // Lerp speed: increases as game progresses
  const speed = map(session.interceptCount, 0, 12, 0.004, 0.018, true);
  signalPos.x = lerp(signalPos.x, signalTarget.x, speed);
  signalPos.y = lerp(signalPos.y, signalTarget.y, speed);

  signalDriftTimer++;

  // How long before the signal picks a new target node
  const driftInterval = map(session.interceptCount, 0, 12, 200, 70, true);
  if (signalDriftTimer > driftInterval) {
    signalDriftTimer = 0;
    const next = floor(random(nodes.length));
    signalTarget = { x: nodes[next].x, y: nodes[next].y };
  }
}

function updateSignalReveal() {
  if (gesture === 'none') {
    signalReveal = max(0.15, signalReveal - 0.006);
    return;
  }

  const d = dist(sweepPos.x, sweepPos.y, signalPos.x, signalPos.y);

  // Open palm: broad scan. Finds/reveals the signal from far away.
  if (gesture === 'scan' && d < SCAN_RADIUS) {
    signalReveal = min(1, signalReveal + 0.045);
    return;
  }

  // Index finger: precise target. Keeps the signal visible if you are close.
  if (gesture === 'target' && d < TARGET_RADIUS) {
    signalReveal = min(1, signalReveal + 0.025);
    return;
  }

  // Two fingers: lock gesture also keeps it visible if close.
  if (gesture === 'lock' && d < LOCK_RADIUS) {
    signalReveal = min(1, signalReveal + 0.018);
    return;
  }

  // If you are not scanning/targeting it, it fades back into noise.
  signalReveal = max(0.15, signalReveal - 0.01);
}


// =============================================================================
// GESTURE DETECTION — ML5 HANDPOSE
// =============================================================================
// *** YOUR IMPLEMENTATION GOES HERE ***
//
// This function is called every frame from draw().
// Read `hands` (populated by ml5 detectStart) and set `gesture`
// and `sweepPos` based on what you detect.
//
// `hands[0].keypoints` gives you 21 keypoints — see the reference block
// at the top of the file (near the HandPose variable declarations).
//
// WHAT THE GAME NEEDS:
//   gesture   → set to 'scan', 'target', 'lock', or 'none' each frame
//   sweepPos  → set .x and .y to the fingertip position in canvas space
//
// THE LOCK TRIGGER IS ALREADY WIRED:
//   When gesture === 'lock' and the cursor is within 65px of the signal dot,
//   the game enters LOCK_ATTEMPT automatically. You just need to set the
//   gesture variable correctly.
//
// DEBUGGING TIP:
//   console.log(hands[0].keypoints) in the browser console (Cmd+Option+J)
//   and watch values change as you move your hand — best way to understand
//   the coordinate space before writing classification logic.
//
// COORDINATE MAPPING REMINDER:
//   Video space (320x240) → Canvas space (1280x720):
//     const canvasX = map(kp[8].x, 0, video.width,  0, width);
//     const canvasY = map(kp[8].y, 0, video.height, 0, height);
//   Smooth with lerp to reduce jitter:
//     sweepPos.x = lerp(sweepPos.x, canvasX, 0.25);

function updateGesture() {
  if (hands.length === 0) {
    gesture = 'none';
    return;
  }

  const kp = hands[0].keypoints;

  // Safety check
  if (!kp || kp.length < 21) {
    gesture = 'none';
    return;
  }

  // Helper: a finger is "up" when the tip is higher than the knuckle.
  // In canvas/video coordinates, smaller y means higher.
  const isFingerUp = (tipIdx, mcpIdx) => {
    return kp[tipIdx].y < kp[mcpIdx].y - 20;
  };

  const indexUp = isFingerUp(8, 5);
  const middleUp = isFingerUp(12, 9);
  const ringUp = isFingerUp(16, 13);
  const pinkyUp = isFingerUp(20, 17);

  // Use index fingertip as cursor
  const fingerX = map(kp[8].x, 0, video.width, 0, width);
  const fingerY = map(kp[8].y, 0, video.height, 0, height);

  // Smooth cursor movement so it does not shake too much
  sweepPos.x = lerp(sweepPos.x, fingerX, 0.25);
  sweepPos.y = lerp(sweepPos.y, fingerY, 0.25);

  const fingersUpCount =
    (indexUp ? 1 : 0) +
    (middleUp ? 1 : 0) +
    (ringUp ? 1 : 0) +
    (pinkyUp ? 1 : 0);

  // Gesture rules:
  // 1 finger  = target
  // 2 fingers = lock
  // 3-4 fingers = scan
  if (indexUp && !middleUp && !ringUp && !pinkyUp) {
    gesture = 'target';
  } else if (indexUp && middleUp && !ringUp && !pinkyUp) {
    gesture = 'lock';
  } else if (fingersUpCount >= 3) {
    gesture = 'scan';
  } else {
    gesture = 'none';
  }
}


// =============================================================================
// DRAW: IDLE SCREEN  (attract / lockout screen)
// =============================================================================
// Plain background — network only appears once the session initializes.
// Scrolling data ticker at the bottom is the only animated element.

function drawIdle() {
  drawDataTicker();

  const cx = width / 2;
  const cy = height / 2 + 10;
  const pw = 460, ph = 180;

  drawPanel(cx - pw / 2, cy - ph / 2, pw, ph, true);

  // Blue accent bar at top of panel
  fill(THEME.blue);
  noStroke();
  rect(cx - pw / 2, cy - ph / 2, pw, 3, 2, 2, 0, 0);

  // Terminal header
  fill(THEME.blue);
  textFont(FONT_MONO);
  textSize(8);
  textAlign(CENTER);
  noStroke();
  text('LOCALIZED DRAGNET SYSTEMS INC.  ·  SLU-04', cx, cy - ph / 2 + 22);

  stroke(THEME.borderLight);
  strokeWeight(0.5);
  line(cx - pw / 2 + 20, cy - ph / 2 + 30, cx + pw / 2 - 20, cy - ph / 2 + 30);

  // Primary lock message
  fill(THEME.textPrimary);
  textFont(FONT_SANS);
  textSize(14);
  textAlign(CENTER);
  noStroke();
  text('SYSTEM LOCKED', cx, cy - 14);

  // Instruction
  fill(THEME.textSecondary);
  textSize(10);
  text('Insert operator floppy disk to initialize session', cx, cy + 14);

  // Demo shortcut
  fill(THEME.textDisabled);
  textSize(8);
  text('[ SPACE — demo mode ]', cx, cy + 40);

  // Blinking lock dot (bottom-right of panel)
  const sy = cy + ph / 2 - 16;
  if (floor(frameCount / 45) % 2 === 0) {
    fill(THEME.danger);
  } else {
    fill(220, 38, 38, 40);
  }
  noStroke();
  ellipse(cx + pw / 2 - 18, sy, 6, 6);

  // Status label next to dot
  fill(THEME.textTertiary);
  textFont(FONT_MONO);
  textSize(7);
  textAlign(RIGHT);
  noStroke();
  text('AUTH: REQUIRED', cx + pw / 2 - 28, sy + 4);
}


// =============================================================================
// DRAW: DATA TICKER
// =============================================================================
// Scrolling data feed strip pinned to the very bottom of the canvas.
// Only shown during the idle attract screen.

function drawDataTicker() {
  const ty = height - 18;

  // Background strip
  fill(THEME.textPrimary);
  noStroke();
  rect(0, height - 30, width, 30);

  // Thin blue accent line at top of strip
  fill(THEME.blue);
  rect(0, height - 30, width, 1);

  // Advance scroll position
  tickerOffset -= 1.2;

  push();
  textFont(FONT_MONO);
  textSize(9);
  const tw = textWidth(TICKER_TEXT);
  if (tickerOffset < -tw) tickerOffset += tw;  // seamless wrap

  fill(THEME.blue);
  noStroke();
  textAlign(LEFT);
  // Draw twice side-by-side so the wrap is always seamless
  text(TICKER_TEXT, tickerOffset, ty + 4);
  text(TICKER_TEXT, tickerOffset + tw, ty + 4);
  pop();
}


// =============================================================================
// DRAW: HUNT PHASE
// =============================================================================
// The main gameplay screen. Network map is fully visible.
// Spotter uses hand gestures; Operator uses the physical panel.

function drawHuntPhase() {
  updateSignalReveal();

  drawNetwork(255);
  drawSignalDot();
  drawSweepCursor();
  drawFrequencyMeter();
  drawSpotterInstructions();

  // Signal must be revealed before lock can start.
  const revealedEnough = signalReveal > 0.65;

  // Check whether to enter LOCK_ATTEMPT state:
  // Spotter must reveal the signal, then hold lock gesture close to it.
  if (gesture === 'lock' && revealedEnough) {
    const d = dist(sweepPos.x, sweepPos.y, signalPos.x, signalPos.y);
    if (d < LOCK_RADIUS && state !== STATE.LOCK_ATTEMPT) {
      state         = STATE.LOCK_ATTEMPT;
      lockCountdown = LOCK_FRAMES;
    }
  } else {
    // If Spotter breaks the lock gesture, cancel the attempt
    if (state === STATE.LOCK_ATTEMPT) state = STATE.HUNT;
  }
}


// =============================================================================
// DRAW: LOCK ATTEMPT
// =============================================================================
// Overlaid on top of drawHuntPhase() when a lock is in progress.
// Shows progress arc + status of both lock conditions.
//
// SUCCESS: both freqLock AND toggle are true before countdown expires
// FAILURE: countdown reaches zero, or Spotter breaks lock gesture

function drawLockAttempt() {
  lockCountdown--;

  // Read operator panel state and check lock conditions
  const potFreq = map(operatorData.pot, 0, 4095, 0, 100);
  const freqLock = abs(potFreq - targetFreq) < FREQ_TOLERANCE;
  const toggled = operatorData.toggle;

  // How far through the lock window are we? (0.0 → 1.0)
  const progress = 1 - (lockCountdown / LOCK_FRAMES);

  // ── Progress arc around signal dot ───────────────────────────────────────
  // Draws a circle that fills clockwise as the countdown runs
  noFill();
  stroke(THEME.blue);
  strokeWeight(2.5);
  arc(
    signalPos.x, signalPos.y,
    88, 88,
    -HALF_PI,
    -HALF_PI + TWO_PI * progress
  );

  // ── Status indicators ─────────────────────────────────────────────────────
  const labelY = signalPos.y + 58;

  // FREQ status chip
  drawStatusChip(
    signalPos.x - 45, labelY,
    'FREQ',
    freqLock ? '✓' : '...',
    freqLock ? THEME.success : THEME.textSecondary
  );

  // TOGGLE status chip
  drawStatusChip(
    signalPos.x + 20, labelY,
    'LOCK',
    toggled ? '✓' : '...',
    toggled ? THEME.success : THEME.textSecondary
  );

  // Countdown label above signal
  fill(THEME.blue);
  noStroke();
  textFont(FONT_MONO);
  textSize(9);
  textAlign(CENTER);
  text(`ACQUIRING — ${ceil(lockCountdown / 60)}s`, signalPos.x, signalPos.y - 52);

  // ── Check success condition ───────────────────────────────────────────────
  if (freqLock && toggled && lockCountdown > 0) {
    session.interceptCount++;
    revealAlpha = 0;
    state = STATE.INTERCEPT_SUCCESS;
    return;
  }

  // ── Check failure condition ───────────────────────────────────────────────
  if (lockCountdown <= 0) {
    state = STATE.HUNT;  // signal escapes, back to hunting
  }
}


// =============================================================================
// DRAW: NETWORK MAP
// =============================================================================
// The background graph. Draws edges first, then nodes on top.
// `alpha` controls overall opacity — used to dim the map during other states.

function drawNetwork(alpha) {
  const a = alpha / 255;

  // ── Edges ─────────────────────────────────────────────────────────────────
  for (const e of edges) {
    const nodeA = nodes[e.a];
    const nodeB = nodes[e.b];
    // Subtle animation: edge opacity varies slowly
    const pulse = sin(frameCount * 0.012 + e.a) * 0.5 + 0.5;
    stroke(225, 229, 235, (40 + pulse * 15) * a * 255);
    strokeWeight(0.75);
    line(nodeA.x, nodeA.y, nodeB.x, nodeB.y);
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────
  for (const n of nodes) {
    const pulse = sin(frameCount * 0.025 + n.phase) * 0.5 + 0.5;

    // Outer glow ring
    noStroke();
    fill(27, 79, 216, (18 + pulse * 12) * a * 255);
    ellipse(n.x, n.y, 16 + pulse * 3, 16 + pulse * 3);

    // Core dot
    fill(27, 79, 216, alpha * a);
    ellipse(n.x, n.y, 5, 5);

    // Node label (tiny, like an IP address)
    fill(156, 163, 175, 120 * a);
    textFont(FONT_MONO);
    textSize(7);
    textAlign(LEFT);
    text(`N${n.id.toString().padStart(2, '0')}`, n.x + 6, n.y - 4);
  }
}


// =============================================================================
// DRAW: ACTIVE SIGNAL DOT
// =============================================================================
// The amber dot that drifts around the map — the thing players are hunting.
// Visually distinct from nodes so it's immediately identifiable.

function drawSignalDot() {
  const pulse = sin(frameCount * 0.07) * 0.5 + 0.5;

  // Convert reveal level to alpha.
  // Hidden signals are faint/noisy. Revealed signals are bright.
  const a = map(signalReveal, 0, 1, 25, 255);

  // Connecting line to nearest node only becomes clear when signal is revealed
  const nearest = nodes.reduce((best, n) => {
    const d = dist(n.x, n.y, signalPos.x, signalPos.y);
    return d < best.d ? { n, d } : best;
  }, { n: nodes[0], d: Infinity }).n;

  stroke(245, 158, 11, a * 0.35);
  strokeWeight(1);
  line(nearest.x, nearest.y, signalPos.x, signalPos.y);

  // If not revealed, draw a vague noisy area instead of a clear signal.
  if (signalReveal < 0.45) {
    noFill();
    stroke(245, 158, 11, 35 + pulse * 25);
    strokeWeight(1);
    ellipse(signalPos.x, signalPos.y, 26 + pulse * 18, 26 + pulse * 18);

    fill(245, 158, 11, 50);
    noStroke();
    ellipse(signalPos.x, signalPos.y, 5, 5);

    fill(245, 158, 11, 90);
    textFont(FONT_MONO);
    textSize(7);
    textAlign(CENTER);
    text('SIGNAL NOISE', signalPos.x, signalPos.y - 16);
    return;
  }

  // Outer glow
  noStroke();
  fill(245, 158, 11, a * 0.22);
  ellipse(signalPos.x, signalPos.y, 34 + pulse * 10, 34 + pulse * 10);

  // Core dot
  fill(245, 158, 11, a);
  ellipse(signalPos.x, signalPos.y, 9, 9);

  // Reveal percentage ring
  noFill();
  stroke(245, 158, 11, a * 0.7);
  strokeWeight(2);
  arc(
    signalPos.x, signalPos.y,
    46, 46,
    -HALF_PI,
    -HALF_PI + TWO_PI * signalReveal
  );

  // Label
  fill(245, 158, 11, a * 0.8);
  textFont(FONT_MONO);
  textSize(8);
  textAlign(CENTER);
  noStroke();

  if (signalReveal > 0.65) {
    text('ACTIVE SIGNAL', signalPos.x, signalPos.y - 24);
  } else {
    text('WEAK SIGNAL', signalPos.x, signalPos.y - 24);
  }
}


// =============================================================================
// DRAW: SWEEP CURSOR
// =============================================================================
// Renders the Spotter's hand position on the map as a corporate-styled cursor.
// Changes appearance based on current gesture state.

function drawSweepCursor() {
  if (gesture === 'none') return;

  const d = dist(sweepPos.x, sweepPos.y, signalPos.x, signalPos.y);

  let cursorColor, ringSize, label;

  if (gesture === 'scan') {
    cursorColor = THEME.blue;
    ringSize = SCAN_RADIUS;
    label = 'SCAN';
  } else if (gesture === 'target') {
    cursorColor = THEME.blue;
    ringSize = TARGET_RADIUS;
    label = 'TARGET';
  } else {
    cursorColor = THEME.success;
    ringSize = LOCK_RADIUS;
    label = 'LOCK';
  }

  const r = parseInt(cursorColor.slice(1,3), 16);
  const g = parseInt(cursorColor.slice(3,5), 16);
  const b = parseInt(cursorColor.slice(5,7), 16);

  // Main action radius
  noFill();
  stroke(r, g, b, 80);
  strokeWeight(1.5);
  ellipse(sweepPos.x, sweepPos.y, ringSize * 2, ringSize * 2);

  // Stronger feedback when your gesture radius overlaps the signal
  if (d < ringSize) {
    stroke(r, g, b, 160);
    strokeWeight(2.5);
    ellipse(sweepPos.x, sweepPos.y, ringSize * 2.15, ringSize * 2.15);
  }

  // Center cursor
  fill(r, g, b, 230);
  noStroke();
  ellipse(sweepPos.x, sweepPos.y, 8, 8);

  // Crosshair
  stroke(r, g, b, 180);
  strokeWeight(1);
  line(sweepPos.x - 10, sweepPos.y, sweepPos.x + 10, sweepPos.y);
  line(sweepPos.x, sweepPos.y - 10, sweepPos.x, sweepPos.y + 10);

  // Label
  fill(r, g, b, 220);
  noStroke();
  textFont(FONT_MONO);
  textSize(9);
  textAlign(CENTER);
  text(label, sweepPos.x, sweepPos.y - ringSize - 8);
}


// =============================================================================
// DRAW: FREQUENCY METER (OPERATOR UI)
// =============================================================================
// Shows the Operator's current pot position vs. the target frequency.
// Positioned bottom-right of the screen — looks like a dashboard widget.

function drawFrequencyMeter() {
  const panelX = width - 240;
  const panelY = height - 115;
  const barW = 195;

  // Panel background
  drawPanel(panelX - 14, panelY - 32, barW + 28, 102, false);

  const potFreq = map(operatorData.pot, 0, 4095, 0, 100);
  const locked = abs(potFreq - targetFreq) < FREQ_TOLERANCE;

  // Header label
  fill(THEME.textSecondary);
  textFont(FONT_SANS);
  textSize(8);
  textAlign(LEFT);
  noStroke();
  text('OPERATOR — FREQUENCY SWEEP', panelX, panelY - 14);

  // Target frequency marker (amber vertical line)
  const targetX = map(targetFreq, 0, 100, panelX, panelX + barW);
  stroke(245, 158, 11, 200);
  strokeWeight(1.5);
  line(targetX, panelY + 6, targetX, panelY + 28);

  // Track (empty bar)
  stroke(THEME.border);
  strokeWeight(6);
  line(panelX, panelY + 17, panelX + barW, panelY + 17);

  // Current value bar — blue normally, green when locked
  const currentX = map(potFreq, 0, 100, panelX, panelX + barW);
  stroke(locked ? THEME.success : THEME.blue);
  strokeWeight(6);
  line(panelX, panelY + 17, currentX, panelY + 17);

  // Labels
  noStroke();
  fill(245, 158, 11, 170);
  textFont(FONT_MONO);
  textSize(7);
  text('TARGET', targetX - 10, panelY + 44);

  fill(locked ? THEME.success : THEME.textTertiary);
  textFont(FONT_SANS);
  textSize(9);
  text(locked ? 'FREQUENCY LOCKED' : 'SEARCHING...', panelX, panelY + 58);
}

function drawSpotterInstructions() {
  const x = width - 310;
  const y = 86;
  const w = 280;
  const h = 118;

  drawPanel(x, y, w, h, false);

  fill(THEME.textPrimary);
  noStroke();
  textFont(FONT_SANS);
  textSize(13);
  textAlign(LEFT);
  text('Spotter controls', x + 16, y + 24);

  fill(THEME.textSecondary);
  textSize(10);
  text('Open palm: scan / reveal hidden signal', x + 16, y + 48);
  text('One finger: target / stabilize signal', x + 16, y + 68);
  text('Two fingers: lock when signal is revealed', x + 16, y + 88);

  fill(THEME.blue);
  textFont(FONT_MONO);
  textSize(9);
  text(`SIGNAL REVEAL: ${floor(signalReveal * 100)}%`, x + 16, y + 108);
}


// =============================================================================
// DRAW: INTERCEPT REVEAL
// =============================================================================
// Fades in a data card showing the intercepted transmission content.
// The card style deliberately mimics a corporate data record / dossier.
// Civilian data is flagged with a red accent; institutional with blue.

function drawInterceptReveal() {
  drawNetwork(50);
  revealAlpha = min(revealAlpha + 5, 255);  // fade in over ~50 frames

  const cx = width / 2;
  const cy = height / 2;
  const isCivilian = currentTx && currentTx.civilian;

  // Card shadow (fake depth)
  fill(0, 0, 0, 12 * (revealAlpha / 255));
  noStroke();
  rect(cx - 275, cy - 105, 554, 212, 6);

  // Card background
  fill(255, 255, 255, revealAlpha);
  noStroke();
  rect(cx - 278, cy - 108, 556, 214, 5);

  // Left accent stripe — red for civilian, blue for institutional
  fill(isCivilian ? THEME.danger : THEME.blue);
  rect(cx - 278, cy - 108, 4, 214, 5, 0, 0, 5);

  // Top label row
  fill(isCivilian ? THEME.danger : THEME.blue);
  noStroke();
  textFont(FONT_SANS);
  textSize(8);
  textAlign(LEFT);
  text('INTERCEPTED TRANSMISSION', cx - 262, cy - 76);

  fill(THEME.textTertiary);
  textAlign(RIGHT);
  text(`TYPE: ${currentTx ? currentTx.type : ''}`, cx + 262, cy - 76);

  // Divider
  stroke(THEME.borderLight);
  strokeWeight(0.5);
  line(cx - 262, cy - 66, cx + 262, cy - 66);

  // Content — the intercepted data itself
  fill(THEME.textPrimary);
  noStroke();
  textFont(FONT_SANS);
  textSize(16);
  textAlign(CENTER);
  text(currentTx ? currentTx.content : '', cx, cy - 20);

  // Metadata row
  fill(THEME.textTertiary);
  textSize(8);
  text(
    `INTERCEPT #${session.interceptCount}  ·  ${isCivilian ? 'CIVILIAN DATA DETECTED' : 'INSTITUTIONAL TRAFFIC'}`,
    cx, cy + 24
  );

  // "Civilian data" warning banner — only shown for civilian transmissions
  if (isCivilian && revealAlpha > 200) {
    fill(THEME.dangerLight);
    noStroke();
    rect(cx - 262, cy + 40, 524, 28, 3);
    fill(THEME.danger);
    textFont(FONT_SANS);
    textSize(9);
    textAlign(CENTER);
    text('⚠  CIVILIAN PERSONAL DATA  ·  DISPOSITION REQUIRED', cx, cy + 59);
  }

  // Prompt to continue
  if (revealAlpha >= 255) {
    fill(THEME.textDisabled);
    textFont(FONT_SANS);
    textSize(9);
    textAlign(CENTER);
    text('SPACE to proceed', cx, cy + 90);
  }
}


// =============================================================================
// DRAW: VOTE SCREEN
// =============================================================================
// Players must vote RETAIN or PURGE on the intercepted data.
// Timer counts down — auto-retains if nobody acts (intentional design choice).
// Hardware buttons or keyboard shortcuts (R / P) accepted.

function drawVoteScreen() {
  drawNetwork(30);
  voteTimer--;

  const cx = width / 2;
  const cy = height / 2;

  // Main panel
  drawPanel(cx - 430, cy - 200, 860, 400, true);

  // Header
  fill(THEME.textSecondary);
  textFont(FONT_SANS);
  textSize(9);
  textAlign(CENTER);
  noStroke();
  text('OPERATOR DISPOSITION REQUIRED', cx, cy - 158);

  // Content being voted on
  fill(THEME.textPrimary);
  textSize(15);
  text(currentTx ? currentTx.content : '', cx, cy - 110);

  // Divider
  stroke(THEME.borderLight);
  strokeWeight(0.5);
  noFill();
  line(cx - 350, cy - 88, cx + 350, cy - 88);

  // ── PURGE button ──────────────────────────────────────────────────────────
  fill(THEME.dangerLight);
  stroke(THEME.danger);
  strokeWeight(1);
  rect(cx - 320, cy - 60, 230, 80, 4);
  fill(THEME.danger);
  noStroke();
  textFont(FONT_SANS);
  textSize(18);
  textAlign(CENTER);
  text('PURGE', cx - 205, cy - 8);
  fill(THEME.textTertiary);
  textSize(8);
  text('[ P ]', cx - 205, cy + 22);

  // ── RETAIN button ─────────────────────────────────────────────────────────
  fill(THEME.successLight);
  stroke(THEME.success);
  strokeWeight(1);
  rect(cx + 90, cy - 60, 230, 80, 4);
  fill(THEME.success);
  noStroke();
  textSize(18);
  text('RETAIN', cx + 205, cy - 8);
  fill(THEME.textTertiary);
  textSize(8);
  text('[ R ]', cx + 205, cy + 22);

  // ── Timer bar ─────────────────────────────────────────────────────────────
  const pct = voteTimer / VOTE_FRAMES;
  // Track
  fill(THEME.borderLight);
  noStroke();
  rect(cx - 350, cy + 60, 700, 6, 3);
  // Fill — goes red in last 30% of time
  fill(pct > 0.3 ? THEME.blue : THEME.danger);
  rect(cx - 350, cy + 60, 700 * pct, 6, 3);

  // Auto-retain warning
  fill(THEME.textTertiary);
  textFont(FONT_MONO);
  textSize(8);
  textAlign(CENTER);
  text(`AUTO-RETAIN IN ${ceil(voteTimer / 60)}s`, cx, cy + 84);

  // Auto-retain when timer expires
  if (voteTimer <= 0) handleVote('RETAIN');
}


// =============================================================================
// VOTE HANDLER
// =============================================================================
// Called when a vote is cast (keyboard, hardware button, or timer expiry).
// Updates session state, triggers printer on RETAIN, escalates handler on purge.

function handleVote(decision) {
  if (state !== STATE.VOTE) return;

  session.lastVote = decision;

  if (decision === 'RETAIN') {
    session.retainCount++;
    session.consecutivePurges = 0;  // reset purge streak
    session.surveillanceIndex = min(100, session.surveillanceIndex + 8);

    // Tell Node.js bridge to fire the Arduino → thermal printer chain
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        client: 'browser',
        type: 'retain_trigger',
        content: currentTx ? currentTx.content : '',
      }));
    }
  } else {
    // PURGE — compliance score drops, purge streak climbs
    session.purgeCount++;
    session.consecutivePurges++;
    session.contractorScore = max(0, session.contractorScore - 15);
  }

  state = STATE.CONSEQUENCE;
  consequenceTimer = CONSEQUENCE_FRAMES;
}


// =============================================================================
// DRAW: CONSEQUENCE SCREEN
// =============================================================================
// Shows the result of the vote. If 3 consecutive purges, the federal handler
// message interrupts with escalating pressure.

function drawConsequenceScreen() {
  drawNetwork(30);
  consequenceTimer--;

  const cx = width / 2;
  const cy = height / 2;

  // ── Federal handler warning — appears after 3 consecutive purges ──────────
  if (session.consecutivePurges >= 3) {
    drawPanel(cx - 440, cy - 130, 880, 260, true);

    // Red accent stripe at top of panel
    fill(THEME.danger);
    noStroke();
    rect(cx - 440, cy - 130, 880, 3, 2, 2, 0, 0);

    fill(THEME.danger);
    textFont(FONT_SANS);
    textSize(9);
    textAlign(CENTER);
    noStroke();
    text('PRIORITY NOTICE — CONTRACTOR COMPLIANCE DIVISION', cx, cy - 92);

    fill(THEME.textPrimary);
    textSize(13);
    text('PURGE RATE EXCEEDS ACCEPTABLE THRESHOLD.', cx, cy - 52);
    text('CONTRACTOR COMPLIANCE SCORE: FAILING.', cx, cy - 24);

    fill(THEME.textSecondary);
    textSize(11);
    text('REVIEW SCHEDULED. CONTINUE OPERATIONS OR FACE CONTRACT TERMINATION.', cx, cy + 12);

    fill(THEME.textDisabled);
    textSize(9);
    text('SPACE to acknowledge', cx, cy + 64);

  } else {
    // ── Normal consequence — brief confirmation of the vote ─────────────────
    drawPanel(cx - 260, cy - 50, 520, 100, false);

    fill(session.lastVote === 'RETAIN' ? THEME.success : THEME.textSecondary);
    textFont(FONT_SANS);
    textSize(12);
    textAlign(CENTER);
    noStroke();
    text(
      session.lastVote === 'RETAIN'
        ? 'DATA RETAINED — RECORD FILED'
        : 'DATA PURGED — NO RECORD RETAINED',
      cx, cy + 6
    );

    fill(THEME.textDisabled);
    textSize(9);
    text('SPACE to continue', cx, cy + 34);
  }
}


// =============================================================================
// DRAW: DEBRIEF
// =============================================================================
// End-of-session summary screen. Shows all session metrics plus the
// real-world surveillance program factoid and the closing message.

function drawDebrief() {
  const cx = width / 2;

  drawPanel(cx - 360, 60, 720, 600, true);

  // Header
  fill(THEME.blue);
  textFont(FONT_SANS);
  textSize(11);
  textAlign(CENTER);
  noStroke();
  text('SESSION COMPLETE — OPERATOR DEBRIEF', cx, 100);

  stroke(THEME.borderLight);
  strokeWeight(0.5);
  line(cx - 300, 112, cx + 300, 112);

  // ── Metrics ───────────────────────────────────────────────────────────────
  const metrics = [
    ['Total intercepts', session.interceptCount],
    ['Civilian data retained', session.retainCount],
    ['Civilian data purged', session.purgeCount],
    ['Contractor compliance', `${session.contractorScore}%`],
  ];

  noStroke();
  metrics.forEach(([label, value], i) => {
    const y = 150 + i * 36;
    fill(THEME.textSecondary);
    textFont(FONT_SANS);
    textSize(10);
    textAlign(LEFT);
    text(label.toUpperCase(), cx - 290, y);
    fill(THEME.textPrimary);
    textSize(12);
    textAlign(RIGHT);
    text(value, cx + 290, y);
    stroke(THEME.borderLight);
    strokeWeight(0.5);
    line(cx - 290, y + 8, cx + 290, y + 8);
    noStroke();
  });

  // ── Surveillance State Index bar ──────────────────────────────────────────
  fill(THEME.textSecondary);
  textFont(FONT_SANS);
  textSize(9);
  textAlign(LEFT);
  noStroke();
  text('SURVEILLANCE STATE INDEX', cx - 290, 315);

  // Background track
  fill(THEME.borderLight);
  rect(cx - 290, 324, 580, 12, 6);
  // Fill
  fill(THEME.danger);
  rect(cx - 290, 324, map(session.surveillanceIndex, 0, 100, 0, 580, true), 12, 6);
  // Label
  fill(THEME.textPrimary);
  textAlign(RIGHT);
  textSize(10);
  text(`${session.surveillanceIndex}%`, cx + 290, 336);

  // ── Real surveillance program factoid ─────────────────────────────────────
  stroke(THEME.borderLight);
  strokeWeight(0.5);
  line(cx - 290, 360, cx + 290, 360);
  noStroke();

  fill(THEME.textTertiary);
  textFont(FONT_MONO);
  textSize(8);
  textAlign(CENTER);
  text('PRISM (2007–present) — NSA bulk collection of internet communications', cx, 384);
  text('from Microsoft, Google, Apple, Facebook, and others.', cx, 398);
  text('Exposed by Edward Snowden. Authorization: FISA Amendments Act, §702.', cx, 412);

  // ── Closing message ───────────────────────────────────────────────────────
  stroke(THEME.borderLight);
  strokeWeight(0.5);
  line(cx - 290, 432, cx + 290, 432);
  noStroke();

  fill(THEME.textTertiary);
  textFont(FONT_SANS);
  textSize(9);
  textAlign(CENTER);
  text('Your biometric data from this session has not been stored.', cx, 460);
  text('You were not asked if it could be.', cx, 478);

  fill(THEME.textDisabled);
  textSize(9);
  text('This is how it usually works.', cx, 500);

  // Reset prompt
  fill(THEME.textDisabled);
  textSize(8);
  text('[ SPACE to reset ]', cx, 540);
}


// =============================================================================
// DRAW: HUD STRIP
// =============================================================================
// Persistent top bar — shows live session metrics at all times.
// Styled as a corporate status bar / dashboard header.

function drawHUD() {
  // Background
  fill(255);
  noStroke();
  rect(0, 0, width, 28);

  // Thin blue accent line at very top
  fill(THEME.blue);
  rect(0, 0, width, 2);

  // Surveillance index fill — creeps right as index climbs
  fill(220, 38, 38, 30);  // faint red wash
  rect(0, 2, map(session.surveillanceIndex, 0, 100, 0, width), 26);

  // Left: session metrics
  fill(THEME.textSecondary);
  textFont(FONT_SANS);
  textSize(9);
  textAlign(LEFT);
  noStroke();
  text(
    `INTERCEPTS: ${session.interceptCount}  ·  RETAINED: ${session.retainCount}  ·  PURGED: ${session.purgeCount}  ·  COMPLIANCE: ${session.contractorScore}%`,
    10, 18
  );

  // Right: surveillance index + state
  textAlign(RIGHT);
  fill(session.surveillanceIndex > 60 ? THEME.danger : THEME.textSecondary);
  text(
    `SURVEILLANCE INDEX: ${session.surveillanceIndex}%  ·  ${state.toUpperCase()}`,
    width - 10, 18
  );
}


// =============================================================================
// DRAW: SPOTTER OVERLAY
// =============================================================================
// Small webcam feed + landmark dots in the bottom-left corner.
// Lets the Spotter player see their own hand tracking in real time.

function drawSpotterOverlay() {
  const vx = 10, vy = height - 188;
  const vw = 213, vh = 160;

  // Webcam feed, mirrored to match ml5 HandPose flipped keypoints
  push();
  translate(vx + vw, vy);
  scale(-1, 1);
  image(video, 0, 0, vw, vh);
  pop();

  // Border
  stroke(THEME.border);
  strokeWeight(0.75);
  noFill();
  rect(vx, vy, vw, vh);

  // HandPose landmark dots — mapped from video space to overlay space
  for (const hand of hands) {
    for (const kp of hand.keypoints) {
      const mx = map(kp.x, 0, video.width, vx, vx + vw);
      const my = map(kp.y, 0, video.height, vy, vy + vh);
      fill(27, 79, 216, 200);
      noStroke();
      ellipse(mx, my, 3.5, 3.5);
    }
  }

  // Label above overlay
  fill(THEME.textSecondary);
  textFont(FONT_SANS);
  textSize(8);
  textAlign(LEFT);
  noStroke();
  text(`SPOTTER — ${gesture.toUpperCase()}`, vx, vy - 4);
}


// =============================================================================
// UI HELPER: PANEL
// =============================================================================
// Draws a white card with subtle shadow and border.
// `elevated` adds a slightly deeper shadow for modal-style panels.

function drawPanel(x, y, w, h, elevated) {
  // Shadow
  fill(0, 0, 0, elevated ? 14 : 8);
  noStroke();
  rect(x + 2, y + 3, w, h, 5);

  // Panel
  fill(THEME.bgPanel);
  stroke(THEME.border);
  strokeWeight(0.5);
  rect(x, y, w, h, 5);
  noStroke();
}


// =============================================================================
// UI HELPER: STATUS CHIP
// =============================================================================
// Small pill-shaped label — used for gesture labels, lock status indicators, etc.

function drawStatusChip(x, y, label, value, col) {
  const r = parseInt(col.slice(1, 3), 16);
  const g = parseInt(col.slice(3, 5), 16);
  const b = parseInt(col.slice(5, 7), 16);

  fill(r, g, b, 20);
  stroke(r, g, b, 80);
  strokeWeight(0.5);
  rect(x, y - 10, 56, 16, 8);

  noStroke();
  fill(r, g, b, 200);
  textFont(FONT_MONO);
  textSize(7);
  textAlign(LEFT);
  text(`${label}: ${value}`, x + 5, y + 2);
}


// =============================================================================
// KEYBOARD INPUT (DEMO / TESTING)
// =============================================================================
// Full keyboard controls for testing without hardware connected.
// SPACE advances through states.
// I = force intercept (bypasses lock mechanic entirely)
// R = RETAIN vote, P = PURGE vote

function keyPressed() {
  if (key === ' ') {
    switch (state) {

      case STATE.IDLE:
        // Start game without floppy — demo mode
        state = STATE.HUNT;
        spawnSignal();
        break;

      case STATE.INTERCEPT_SUCCESS:
        // Move to vote screen once the reveal has faded in
        if (revealAlpha >= 255) {
          state = STATE.VOTE;
          voteTimer = VOTE_FRAMES;
        }
        break;

      case STATE.CONSEQUENCE:
        // Either loop back for another intercept, or end the session
        if (session.interceptCount >= 10) {
          state = STATE.DEBRIEF;
        } else {
          spawnSignal();
          state = STATE.HUNT;
        }
        break;

      case STATE.DEBRIEF:
        // Full reset — wipe all session data and start over
        session = {
          interceptCount: 0, retainCount: 0, purgeCount: 0,
          surveillanceIndex: 0, consecutivePurges: 0,
          contractorScore: 100, lastVote: null,
        };
        spawnSignal();
        state = STATE.HUNT;
        break;
    }
  }

  // Force a successful intercept — skips lock mechanic for testing
  // Useful when ESP32 is not connected and you need to test the reveal/vote flow
  if ((key === 'i' || key === 'I') &&
    (state === STATE.HUNT || state === STATE.LOCK_ATTEMPT)) {
    session.interceptCount++;
    revealAlpha = 0;
    state = STATE.INTERCEPT_SUCCESS;
  }

  // Vote shortcuts — hardware buttons are preferred in final installation
  if ((key === 'r' || key === 'R') && state === STATE.VOTE) handleVote('RETAIN');
  if ((key === 'p' || key === 'P') && state === STATE.VOTE) handleVote('PURGE');
}
