// =============================================================================
// sketch.js — INTERCEPT: Localized Dragnet
// =============================================================================
// Main game file. Runs in the browser using p5.js for rendering and ml5.js
// for computer vision (HandPose + FaceMesh).
//
// Created by Isaac and Demirhan. Particle effects, UI mockup, code comments, and format done by Claude


// =============================================================================
// CORPORATE DESIGN SYSTEM
// =============================================================================

const THEME = {
  bgPage:        '#F0F2F5',
  bgPanel:       '#FFFFFF',
  bgPanelAlt:    '#F8F9FA',
  blue:          '#1B4FD8',
  blueLight:     '#EFF6FF',
  blueMid:       '#BFDBFE',
  blueDim:       '#93C5FD',
  danger:        '#DC2626',
  dangerLight:   '#FEF2F2',
  success:       '#16A34A',
  successLight:  '#F0FDF4',
  textPrimary:   '#111827',
  textSecondary: '#6B7280',
  textTertiary:  '#9CA3AF',
  textDisabled:  '#D1D5DB',
  border:        '#E5E7EB',
  borderLight:   '#F3F4F6',
  nodeColor:     '#1B4FD8',
  edgeColor:     '#E5E7EB',
  signalColor:   '#F59E0B',
};

const FONT_SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const FONT_MONO = 'Courier New, Courier, monospace';


// =============================================================================
// GAME STATE MACHINE
// =============================================================================
//
//  IDLE → HUNT → LOCK_ATTEMPT → INTERCEPT_SUCCESS → VOTE → CONSEQUENCE
//    ↑                                                          |
//    └─────────────── (loop, or DEBRIEF at 10 intercepts) ─────┘

const STATE = {
  IDLE:              'idle',
  HUNT:              'hunt',
  LOCK_ATTEMPT:      'lock_attempt',
  INTERCEPT_SUCCESS: 'intercept_success',
  VOTE:              'vote',
  CONSEQUENCE:       'consequence',
  DEBRIEF:           'debrief',
};

let state = STATE.IDLE;


// =============================================================================
// SESSION STATE
// =============================================================================

let session = {
  interceptCount:    0,
  retainCount:       0,
  purgeCount:        0,
  surveillanceIndex: 0,
  consecutivePurges: 0,
  contractorScore:   100,
  lastVote:          null,
  terminated:        false,  // true when contract terminated by excessive purging
};


// =============================================================================
// NETWORK MAP
// =============================================================================

let nodes = [];
let edges = [];

let signalPos        = { x: 0, y: 0 };
let signalTarget     = { x: 0, y: 0 };
let targetFreq       = 50;
let currentTx        = null;
let signalDriftTimer = 0;
let signalReveal     = 0.25;

const SCAN_RADIUS   = 170;
const TARGET_RADIUS = 75;
const LOCK_RADIUS   = 75;


// =============================================================================
// TRANSMISSION LIBRARY
// =============================================================================
// To add new transmissions: copy any line and change the content.
// civilian: false = shows early (looks institutional)
// civilian: true  = shows mid-to-late game (unmistakably personal)
// type: 'DATA' | 'VOICE' | 'ENCRYPTED'

const TRANSMISSIONS = [
  // Institutional — shown in first 4 intercepts
  { type: 'DATA',      content: 'Routing packet #4471 — institutional origin',             civilian: false },
  { type: 'ENCRYPTED', content: 'Encrypted payload — classification: PENDING',             civilian: false },
  { type: 'VOICE',     content: 'Metadata bundle — network infrastructure node',           civilian: false },
  { type: 'DATA',      content: 'Traffic log — South Lake Union datacenter relay',         civilian: false },

  // Civilian — shown from intercept 5 onward
  { type: 'DATA',      content: 'Transaction: $34.50 — Pike Place Market, 11:02 PM',       civilian: true  },
  { type: 'VOICE',     content: 'Location ping — Capitol Hill, 11:43 PM',                  civilian: true  },
  { type: 'DATA',      content: 'Search query: "urgent care open near me"',                civilian: true  },
  { type: 'VOICE',     content: 'Text message: "are you safe? haven\'t heard from you"',   civilian: true  },
  { type: 'DATA',      content: 'Transit swipe — Link Light Rail, UW Station, 12:14 AM',   civilian: true  },
  { type: 'ENCRYPTED', content: 'Medical query: prescription refill — recurring',          civilian: true  },
  { type: 'VOICE',     content: 'Call log — duration 0:23 — unregistered recipient',       civilian: true  },
  { type: 'DATA',      content: 'Location history — 14 waypoints, 6-hour window',         civilian: true  },
  { type: 'DATA',      content: 'Dating app location shared — Capitol Hill, 0.3mi away',  civilian: true  },
  { type: 'VOICE',     content: 'Voice assistant query: "what time does planned parenthood open"', civilian: true },
  { type: 'DATA',      content: 'Venmo note: "rent" — $1,240.00, sent 11:58 PM',          civilian: true  },
  { type: 'DATA',      content: 'Rideshare pickup: 23rd Ave and Union St, 1:14 AM',        civilian: true  },
  { type: 'ENCRYPTED', content: 'Fitness tracker: elevated heart rate, location matches protest route', civilian: true },
  { type: 'DATA',      content: 'Browser history: "how to join a union" — 14 related queries', civilian: true },
  { type: 'VOICE',     content: 'Search: "immigration lawyer Seattle free consultation"',  civilian: true  },
  { type: 'DATA',      content: 'Political donation: $25.00 — FEC record logged',          civilian: true  },
  { type: 'ENCRYPTED', content: 'Email draft: unsent — subject line visible to metadata', civilian: true  },
  { type: 'VOICE',     content: 'Phone call: duration 4:12 — reproductive health clinic',  civilian: true  },
];

const TICKER_TEXT =
  '  NODE N00 ACTIVE  ·  ROUTING PKT#4471  ·  ORIGIN: MASKED  ·  DEST: FED-RELAY-01  ·  CLASSIFICATION: PENDING  ·  ' +
  '  NODE N07 NOMINAL  ·  TRANSMISSION RATE: 1.2 Gbps  ·  INTERCEPT QUEUE: READY  ·  ' +
  '  SOUTH LAKE UNION DATACENTER  ·  OPERATOR SESSION: UNINITIALIZED  ·  INSERT CREDENTIAL TO INITIALIZE  ·  ' +
  '  FEDERAL RELAY STATUS: ONLINE  ·  AES-256 ENCRYPTION ACTIVE  ·  RETENTION POLICY: ENGAGED  ·  ';


// =============================================================================
// ML5 HANDPOSE — CONTROLLER 2 (SPOTTER)
// =============================================================================
// Partner's implementation. Sets `gesture` and `sweepPos` each frame.
//
// gesture:  'scan' | 'target' | 'lock' | 'none'
// sweepPos: canvas-space fingertip position

let handPose;
let video;
let hands    = [];
let gesture  = 'none';
let sweepPos = { x: 400, y: 360 };


// =============================================================================
// ML5 FACEMESH — BIOMETRIC SCAN (VOTE PHASE)
// =============================================================================
// FaceMesh tracks 478 facial landmarks per detected face.
// Used during the VOTE phase to display a fabricated "Confidence Score"
// above each player's station.
//
// THE SCORE IS NOT REAL. It is a proxy metric derived from brow elevation
// and mouth openness, presented as authoritative biometric data.
// This is intentional — it is the critique.
// The system fabricates a psychological readout and treats it as fact.
// That is exactly how real behavioral scoring infrastructure operates.
//
// KEY LANDMARKS USED:
//   105 = left eyebrow center-top
//   334 = right eyebrow center-top
//   159 = left eye center
//   386 = right eye center
//   13  = upper lip
//   14  = lower lip

let faceMesh;
let faces      = [];    // up to 2 faces detected simultaneously

// Biometric scan state — managed within STATE.VOTE
const SCAN_DURATION  = 150;   // 2.5s scan before scores lock in (frames)
let   scanTimer      = 0;     // counts down from SCAN_DURATION
let   scanComplete   = false; // true once scores are locked in
let   faceScores     = [50, 50]; // locked confidence scores [player1, player2]
let   liveFaceScores = [50, 50]; // live derived scores shown during scan


// =============================================================================
// OPERATOR INPUT — ESP32 VIA WEBSOCKET
// =============================================================================
// SINGLE RED ARCADE BUTTON design:
//   action_held  → held state — used as lock toggle during LOCK_ATTEMPT
//   action_press → rising edge — triggers PURGE vote during VOTE
//
// The button's behavior is routed by game state.
// Doing nothing during VOTE = auto-RETAIN on timer expiry.
// Pressing the red button = PURGE (active resistance).
// This mirrors how surveillance actually works:
//   inaction defaults to retention; resistance requires effort.

let operatorData = {
  pot:          0,      // potentiometer 0–4095
  action_held:  false,  // button held (for lock toggle)
  action_press: false,  // rising edge (for PURGE vote)
};

let ws;


// =============================================================================
// LOCK MECHANICS
// =============================================================================

const LOCK_FRAMES    = 180;
const FREQ_TOLERANCE = 8;
let   lockCountdown  = 0;


// =============================================================================
// VOTE / CONSEQUENCE TIMING
// =============================================================================

const VOTE_FRAMES        = 300;
let   voteTimer          = 0;
const CONSEQUENCE_FRAMES = 150;
let   consequenceTimer   = 0;


// =============================================================================
// ANIMATION STATE
// =============================================================================

let revealAlpha  = 0;
let tickerOffset = 0;


// =============================================================================
// PARTICLE SYSTEM
// =============================================================================
// Five emitters serving distinct visual and narrative purposes:
//
//  1. STREAM  — data packets travelling along network edges (always on)
//  2. REVEAL  — amber burst radiating from signal as Spotter scans
//  3. CAPTURE — blue particles collapsing into signal on successful intercept
//  4. RETAIN  — red particles falling downward on RETAIN vote
//  5. AMBIENT — faint red haze drifting upward, density = surveillance index

let particles        = [];
let edgeStreamTimers = [];

class Particle {
  constructor(x, y, type, extras = {}) {
    this.type  = type;
    this.pos   = createVector(x, y);
    this.alpha = 255;

    switch (type) {

      case 'stream':
        // Travels along a network edge from node A to node B via lerp
        this.startPos = createVector(x, y);
        this.endPos   = extras.endPos;
        this.t        = 0;
        this.speed    = random(0.004, 0.012);
        this.size     = random(2.5, 4);
        this.col      = extras.highlighted
          ? color(245, 158, 11, 210)   // amber — matches active signal, marks hot edges
          : color(27, 79, 216, 60);    // muted blue — regular network traffic
        break;

      case 'reveal':
        // Radiates outward as signal becomes visible
        const angle = random(TWO_PI);
        const spd   = random(0.8, 2.2);
        this.vel    = createVector(cos(angle) * spd, sin(angle) * spd);
        this.size   = random(2, 4.5);
        this.alpha  = random(160, 240);
        this.col    = color(245, 158, 11);   // amber
        break;

      case 'capture':
        // Spawns scattered around signal, converges inward
        const a2 = random(TWO_PI);
        const r2 = random(80, 220);
        this.pos    = createVector(x + cos(a2) * r2, y + sin(a2) * r2);
        this.target = createVector(x, y);
        this.speed  = random(3, 7);
        this.size   = random(2, 5);
        this.alpha  = 220;
        this.col    = color(27, 79, 216);    // blue
        break;

      case 'retain':
        // Falls downward like data being filed
        this.vel   = createVector(random(-0.4, 0.4), random(1.2, 3.0));
        this.size  = random(2, 4);
        this.alpha = random(180, 255);
        this.col   = color(220, 38, 38);     // red
        break;

      case 'ambient':
        // Slow upward drift, density tied to surveillance index
        this.vel   = createVector(random(-0.15, 0.15), random(-0.4, -0.9));
        this.size  = random(1.5, 3);
        this.alpha = random(20, 55);         // always faint
        this.col   = color(220, 38, 38);
        break;
    }
  }

  update() {
    switch (this.type) {
      case 'stream':
        this.t += this.speed;
        this.pos = p5.Vector.lerp(this.startPos, this.endPos, this.t);
        if (this.t > 0.8)  this.alpha = map(this.t, 0.8, 1.0, 200, 0);
        if (this.t >= 1.0) this.alpha = 0;
        break;
      case 'reveal':
        this.pos.add(this.vel);
        this.vel.mult(0.94);
        this.alpha -= 5;
        break;
      case 'capture':
        const dir = p5.Vector.sub(this.target, this.pos);
        dir.setMag(this.speed);
        this.pos.add(dir);
        this.alpha -= 6;
        if (this.pos.dist(this.target) < 8) this.alpha = 0;
        break;
      case 'retain':
        this.pos.add(this.vel);
        this.vel.y += 0.06;
        this.alpha -= 2.5;
        break;
      case 'ambient':
        this.pos.add(this.vel);
        this.alpha -= 0.4;
        break;
    }
  }

  draw() {
    noStroke();
    const c = this.col;
    fill(red(c), green(c), blue(c), this.alpha);
    ellipse(this.pos.x, this.pos.y, this.size, this.size);
  }

  isDead() {
    return this.alpha <= 0 || this.pos.y > height + 20;
  }
}

function spawnRevealBurst(count) {
  for (let i = 0; i < count; i++)
    particles.push(new Particle(signalPos.x, signalPos.y, 'reveal'));
}

function spawnCaptureEffect() {
  for (let i = 0; i < 40; i++)
    particles.push(new Particle(signalPos.x, signalPos.y, 'capture'));
}

function spawnRetainEffect() {
  for (let i = 0; i < 35; i++)
    particles.push(new Particle(
      signalPos.x + random(-30, 30),
      signalPos.y + random(-10, 10),
      'retain'
    ));
}

function spawnAmbientParticles() {
  const rate = map(session.surveillanceIndex, 0, 100, 0.04, 0.55, true);
  if (random() < rate)
    particles.push(new Particle(random(width), random(height * 0.3, height), 'ambient'));
}

function updateEdgeStreams() {
  // Stream particles only make sense when the network map is the main focus.
  // Suppress during idle (minimal screen), intercept reveal (map is dimmed/covered),
  // vote (overlay screen), and debrief (no map shown).
  if (state === STATE.IDLE ||
      state === STATE.INTERCEPT_SUCCESS ||
      state === STATE.VOTE ||
      state === STATE.DEBRIEF) return;

  if (nodes.length === 0) return;

  if (edgeStreamTimers.length !== edges.length)
    edgeStreamTimers = edges.map(() => floor(random(20, 80)));

  edges.forEach((e, i) => {
    edgeStreamTimers[i]--;
    if (edgeStreamTimers[i] <= 0) {
      const nodeA   = nodes[e.a];
      const nodeB   = nodes[e.b];
      const nearSig = dist(nodeA.x, nodeA.y, signalPos.x, signalPos.y) < 180 ||
                      dist(nodeB.x, nodeB.y, signalPos.x, signalPos.y) < 180;
      const from    = random() > 0.5 ? nodeA : nodeB;
      const to      = from === nodeA ? nodeB : nodeA;

      particles.push(new Particle(from.x, from.y, 'stream', {
        endPos:      createVector(to.x, to.y),
        highlighted: nearSig,
      }));
      edgeStreamTimers[i] = nearSig ? floor(random(15, 35)) : floor(random(40, 100));
    }
  });
}

function updateParticles() {
  updateEdgeStreams();
  spawnAmbientParticles();

  // Reveal micro-burst while Spotter is scanning
  if (state === STATE.HUNT || state === STATE.LOCK_ATTEMPT) {
    const d = dist(sweepPos.x, sweepPos.y, signalPos.x, signalPos.y);
    if (gesture === 'scan' && d < SCAN_RADIUS && signalReveal < 0.98) {
      if (frameCount % 4 === 0) spawnRevealBurst(2);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    if (particles[i].isDead()) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) p.draw();
}


// =============================================================================
// PRELOAD
// =============================================================================

function preload() {
  handPose = ml5.handPose({ flipped: true });
  // FaceMesh: track up to 2 faces (one per player), mirror to match HandPose
  faceMesh = ml5.faceMesh({ maxFaces: 2, flipped: true });
}


// =============================================================================
// SETUP
// =============================================================================

function setup() {
  createCanvas(1280, 720);
  frameRate(60);

  video = createCapture(VIDEO);
  video.size(320, 240);
  video.hide();

  handPose.detectStart(video, (results) => { hands = results; });
  faceMesh.detectStart(video, (results) => { faces = results; });

  buildNetwork();
  connectWebSocket();
}


// =============================================================================
// NETWORK MAP BUILDER
// =============================================================================

function buildNetwork() {
  const positions = [
    { x: 180, y: 140 }, { x: 400, y:  90 }, { x: 650, y: 160 },
    { x: 870, y: 110 }, { x: 140, y: 360 }, { x: 380, y: 300 },
    { x: 620, y: 380 }, { x: 840, y: 330 }, { x: 280, y: 540 },
    { x: 570, y: 530 }, { x: 790, y: 500 }, { x: 1020, y: 280 },
  ];

  nodes = positions.map((p, i) => ({
    id: i, x: p.x, y: p.y, phase: random(TWO_PI),
  }));

  const pairs = [
    [0,1],[1,2],[2,3],[3,11],[4,5],[5,6],[6,7],[7,11],
    [0,4],[1,5],[2,6],[3,7],[5,9],[6,10],[8,9],[9,10],[10,11],[4,8],
  ];
  edges = pairs.map(([a, b]) => ({ a, b }));
}


// =============================================================================
// WEBSOCKET CONNECTION
// =============================================================================

function connectWebSocket() {
  ws = new WebSocket('ws://localhost:8080');

  ws.onopen = () => {
    console.log('[WS] Connected to bridge');
    ws.send(JSON.stringify({ client: 'browser', type: 'hello' }));
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); }
    catch { return; }

    // Floppy init
    if (msg.type === 'init' && state === STATE.IDLE) {
      state = STATE.HUNT;
      spawnSignal();
    }

    // ESP32 operator panel
    if (msg.client === 'esp32_operator') {
      operatorData = msg;

      // Haptic feedback during lock attempt
      if (state === STATE.LOCK_ATTEMPT) {
        const potFreq   = map(msg.pot, 0, 4095, 0, 100);
        const diff      = abs(potFreq - targetFreq);
        const intensity = map(diff, 0, 40, 1.0, 0.0, true);
        ws.send(JSON.stringify({ client: 'browser', type: 'haptic', intensity }));
      }

      // Red button advances through all states — same logic as SPACE key
      if (msg.action_press) {
        switch (state) {
          case STATE.IDLE:
            state = STATE.HUNT; spawnSignal(); break;

          case STATE.VOTE:
            handleVote('PURGE'); break;

          case STATE.INTERCEPT_SUCCESS:
            if (revealAlpha >= 255) {
              scanTimer = SCAN_DURATION; scanComplete = false; faceScores = [50, 50];
              state = STATE.VOTE; voteTimer = VOTE_FRAMES;
            }
            break;

          case STATE.CONSEQUENCE:
            if (session.interceptCount >= 10) {
              goToDebrief();
            } else {
              spawnSignal(); state = STATE.HUNT;
            }
            break;

          case STATE.DEBRIEF:
            session = {
              interceptCount: 0, retainCount: 0, purgeCount: 0,
              surveillanceIndex: 0, consecutivePurges: 0,
              contractorScore: 100, lastVote: null, terminated: false,
            };
            spawnSignal(); state = STATE.HUNT; break;
        }
      }
    }
  };

  ws.onclose = () => setTimeout(connectWebSocket, 2000);
  ws.onerror = (e) => console.warn('[WS] Error:', e);
}


// =============================================================================
// ENTER DEBRIEF
// =============================================================================
// Call this instead of setting state = STATE.DEBRIEF directly.
// Sends the floppy eject signal to the Node.js bridge before transitioning.

function goToDebrief() {
  state = STATE.DEBRIEF;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ client: 'browser', type: 'eject_floppy' }));
  }
}


// =============================================================================
// SPAWN SIGNAL
// =============================================================================

function spawnSignal() {
  const idx    = floor(random(nodes.length));
  signalPos    = { x: nodes[idx].x, y: nodes[idx].y };
  signalTarget = { x: nodes[idx].x, y: nodes[idx].y };
  signalDriftTimer = 0;
  targetFreq   = floor(random(15, 85));

  let pool;
  if      (session.interceptCount < 4) pool = TRANSMISSIONS.filter(t => !t.civilian);
  else if (session.interceptCount < 8) pool = TRANSMISSIONS;
  else                                  pool = TRANSMISSIONS.filter(t =>  t.civilian);

  currentTx    = random(pool);
  signalReveal = 0.25;
}


// =============================================================================
// MAIN DRAW LOOP
// =============================================================================

function draw() {
  background(THEME.bgPage);

  updateGesture();
  updateSignalDrift();
  updateParticles();
  updateFaceMesh();     // derive live confidence scores every frame

  switch (state) {
    case STATE.IDLE:              drawIdle();             break;
    case STATE.HUNT:              drawHuntPhase();        break;
    case STATE.LOCK_ATTEMPT:      drawHuntPhase();
                                  drawLockAttempt();      break;
    case STATE.INTERCEPT_SUCCESS: drawInterceptReveal();  break;
    case STATE.VOTE:              drawVoteScreen();        break;
    case STATE.CONSEQUENCE:       drawConsequenceScreen(); break;
    case STATE.DEBRIEF:           drawDebrief();          break;
  }

  drawParticles();
  drawSpotterOverlay();
  drawHUD();
}


// =============================================================================
// SIGNAL DRIFT
// =============================================================================

function updateSignalDrift() {
  const speed = map(session.interceptCount, 0, 12, 0.004, 0.018, true);
  signalPos.x = lerp(signalPos.x, signalTarget.x, speed);
  signalPos.y = lerp(signalPos.y, signalTarget.y, speed);

  signalDriftTimer++;
  const driftInterval = map(session.interceptCount, 0, 12, 200, 70, true);
  if (signalDriftTimer > driftInterval) {
    signalDriftTimer = 0;
    const next   = floor(random(nodes.length));
    signalTarget = { x: nodes[next].x, y: nodes[next].y };
  }
}

function updateSignalReveal() {
  if (gesture === 'none') { signalReveal = max(0.15, signalReveal - 0.006); return; }

  const d = dist(sweepPos.x, sweepPos.y, signalPos.x, signalPos.y);
  if (gesture === 'scan'   && d < SCAN_RADIUS)   { signalReveal = min(1, signalReveal + 0.045); return; }
  if (gesture === 'target' && d < TARGET_RADIUS) { signalReveal = min(1, signalReveal + 0.025); return; }
  if (gesture === 'lock'   && d < LOCK_RADIUS)   { signalReveal = min(1, signalReveal + 0.018); return; }
  signalReveal = max(0.15, signalReveal - 0.01);
}


// =============================================================================
// GESTURE DETECTION — ML5 HANDPOSE (partner's implementation)
// =============================================================================

function updateGesture() {
  if (hands.length === 0) { gesture = 'none'; return; }

  const kp = hands[0].keypoints;
  if (!kp || kp.length < 21) { gesture = 'none'; return; }

  const isFingerUp = (tipIdx, mcpIdx) => kp[tipIdx].y < kp[mcpIdx].y - 20;

  const indexUp  = isFingerUp(8,  5);
  const middleUp = isFingerUp(12, 9);
  const ringUp   = isFingerUp(16, 13);
  const pinkyUp  = isFingerUp(20, 17);

  const fx = map(kp[8].x, 0, video.width,  0, width);
  const fy = map(kp[8].y, 0, video.height, 0, height);
  sweepPos.x = lerp(sweepPos.x, fx, 0.25);
  sweepPos.y = lerp(sweepPos.y, fy, 0.25);

  const count = (indexUp?1:0) + (middleUp?1:0) + (ringUp?1:0) + (pinkyUp?1:0);

  if      (indexUp && !middleUp && !ringUp && !pinkyUp) gesture = 'target';
  else if (indexUp &&  middleUp && !ringUp && !pinkyUp) gesture = 'lock';
  else if (count >= 3)                                  gesture = 'scan';
  else                                                  gesture = 'none';
}


// =============================================================================
// FACEMESH — BIOMETRIC CONFIDENCE SCORE
// =============================================================================
// Derives a fabricated "confidence" metric from facial landmark positions.
// Called every frame; scores are locked in after SCAN_DURATION frames
// when the vote phase begins.
//
// The metric is constructed, not measured. Brow elevation and mouth openness
// are plausible proxies but they are not ground truth. The score is presented
// as authoritative regardless. That is the point.

function updateFaceMesh() {
  if (state !== STATE.VOTE) return;

  // Derive live scores from current face positions
  for (let i = 0; i < 2; i++) {
    liveFaceScores[i] = faces[i] ? deriveFaceScore(faces[i]) : 50;
  }

  // Countdown the scan phase
  if (!scanComplete) {
    scanTimer--;
    if (scanTimer <= 0) {
      // Lock in the scores — they won't change for the rest of this vote
      faceScores[0]  = liveFaceScores[0];
      faceScores[1]  = liveFaceScores[1];
      scanComplete   = true;
    }
  }
}

// Derive a 0–100 confidence score from one face's landmarks.
// Higher = "confident", lower = "hesitant".
// Components:
//   Brow elevation: raised brows relative to eye center → more hesitant
//   Mouth openness: open mouth → more hesitant
function deriveFaceScore(face) {
  const kp = face.keypoints;
  if (!kp || kp.length < 400) return 50;

  // Brow gap: how far above the eye center the brow sits
  // kp[105] = left brow top, kp[159] = left eye center
  // kp[334] = right brow top, kp[386] = right eye center
  const leftBrowGap  = (kp[159] && kp[105]) ? (kp[159].y - kp[105].y) : 20;
  const rightBrowGap = (kp[386] && kp[334]) ? (kp[386].y - kp[334].y) : 20;
  const avgBrowGap   = (leftBrowGap + rightBrowGap) / 2;

  // Mouth openness: distance between upper and lower lip
  // kp[13] = upper lip, kp[14] = lower lip
  const mouthOpen = (kp[13] && kp[14]) ? abs(kp[14].y - kp[13].y) : 5;

  // Map to confidence: larger brow gap or more open mouth = lower confidence
  const browScore  = map(avgBrowGap, 15, 35, 100, 20, true);
  const mouthScore = map(mouthOpen,  2,  18, 100, 10, true);

  // Weighted combination + smoothed noise to look more "algorithmic"
  const raw = (browScore * 0.65) + (mouthScore * 0.35);
  return constrain(floor(raw + random(-3, 3)), 0, 100);
}


// =============================================================================
// DRAW: IDLE SCREEN
// =============================================================================

function drawIdle() {
  drawDataTicker();

  const cx = width / 2, cy = height / 2 + 10;
  const pw = 460, ph = 180;

  drawPanel(cx - pw/2, cy - ph/2, pw, ph, true);

  fill(THEME.blue); noStroke();
  rect(cx - pw/2, cy - ph/2, pw, 3, 2, 2, 0, 0);

  fill(THEME.blue);
  textFont(FONT_MONO); textSize(8); textAlign(CENTER);
  text('LOCALIZED DRAGNET SYSTEMS INC.  ·  SLU-04', cx, cy - ph/2 + 22);

  stroke(THEME.borderLight); strokeWeight(0.5);
  line(cx - pw/2 + 20, cy - ph/2 + 30, cx + pw/2 - 20, cy - ph/2 + 30);

  fill(THEME.textPrimary); textFont(FONT_SANS); textSize(14);
  textAlign(CENTER); noStroke();
  text('SYSTEM LOCKED', cx, cy - 14);

  fill(THEME.textSecondary); textSize(10);
  text('Insert operator floppy disk to initialize session', cx, cy + 14);

  fill(THEME.textDisabled); textSize(8);
  text('[ SPACE — demo mode ]', cx, cy + 40);
}


// =============================================================================
// DRAW: DATA TICKER
// =============================================================================

function drawDataTicker() {
  fill(THEME.textPrimary); noStroke(); rect(0, height - 30, width, 30);
  fill(THEME.blue); rect(0, height - 30, width, 1);

  tickerOffset -= 1.2;
  push();
  textFont(FONT_MONO); textSize(9);
  const tw = textWidth(TICKER_TEXT);
  if (tickerOffset < -tw) tickerOffset += tw;
  fill(THEME.blue); noStroke(); textAlign(LEFT);
  text(TICKER_TEXT, tickerOffset,      height - 10);
  text(TICKER_TEXT, tickerOffset + tw, height - 10);
  pop();
}


// =============================================================================
// DRAW: HUNT PHASE
// =============================================================================

function drawHuntPhase() {
  updateSignalReveal();
  drawNetwork(255);
  drawSignalDot();
  drawSweepCursor();
  drawFrequencyMeter();
  drawSpotterInstructions();

  const revealedEnough = signalReveal > 0.65;

  if (gesture === 'lock' && revealedEnough) {
    const d = dist(sweepPos.x, sweepPos.y, signalPos.x, signalPos.y);
    if (d < LOCK_RADIUS && state !== STATE.LOCK_ATTEMPT) {
      state         = STATE.LOCK_ATTEMPT;
      lockCountdown = LOCK_FRAMES;
    }
  } else {
    if (state === STATE.LOCK_ATTEMPT) state = STATE.HUNT;
  }
}


// =============================================================================
// DRAW: LOCK ATTEMPT
// =============================================================================

function drawLockAttempt() {
  lockCountdown--;

  const potFreq  = map(operatorData.pot, 0, 4095, 0, 100);
  const freqLock = abs(potFreq - targetFreq) < FREQ_TOLERANCE;
  // Single button: action_held is the lock toggle
  const toggled  = operatorData.action_held;
  const progress = 1 - (lockCountdown / LOCK_FRAMES);

  noFill(); stroke(THEME.blue); strokeWeight(2.5);
  arc(signalPos.x, signalPos.y, 88, 88, -HALF_PI, -HALF_PI + TWO_PI * progress);

  const labelY = signalPos.y + 58;
  drawStatusChip(signalPos.x - 45, labelY, 'FREQ', freqLock ? '✓' : '...', freqLock ? THEME.success : THEME.textSecondary);
  drawStatusChip(signalPos.x + 20, labelY, 'LOCK', toggled  ? '✓' : '...', toggled  ? THEME.success : THEME.textSecondary);

  fill(THEME.blue); noStroke(); textFont(FONT_MONO); textSize(9); textAlign(CENTER);
  text(`ACQUIRING — ${ceil(lockCountdown / 60)}s`, signalPos.x, signalPos.y - 52);

  if (freqLock && toggled && lockCountdown > 0) {
    session.interceptCount++;
    revealAlpha = 0;
    spawnCaptureEffect();
    state = STATE.INTERCEPT_SUCCESS;
    return;
  }

  if (lockCountdown <= 0) state = STATE.HUNT;
}


// =============================================================================
// DRAW: NETWORK MAP
// =============================================================================

function drawNetwork(alpha) {
  const a = alpha / 255;

  for (const e of edges) {
    const nodeA = nodes[e.a], nodeB = nodes[e.b];
    const pulse = sin(frameCount * 0.012 + e.a) * 0.5 + 0.5;
    stroke(225, 229, 235, (40 + pulse * 15) * a * 255);
    strokeWeight(0.75);
    line(nodeA.x, nodeA.y, nodeB.x, nodeB.y);
  }

  for (const n of nodes) {
    const pulse = sin(frameCount * 0.025 + n.phase) * 0.5 + 0.5;
    noStroke();
    fill(27, 79, 216, (18 + pulse * 12) * a * 255);
    ellipse(n.x, n.y, 16 + pulse * 3, 16 + pulse * 3);
    fill(27, 79, 216, alpha * a);
    ellipse(n.x, n.y, 5, 5);
    fill(156, 163, 175, 120 * a);
    textFont(FONT_MONO); textSize(7); textAlign(LEFT);
    text(`N${n.id.toString().padStart(2,'0')}`, n.x + 6, n.y - 4);
  }
}


// =============================================================================
// DRAW: ACTIVE SIGNAL DOT
// =============================================================================

function drawSignalDot() {
  const pulse = sin(frameCount * 0.07) * 0.5 + 0.5;
  const a     = map(signalReveal, 0, 1, 25, 255);

  const nearest = nodes.reduce((best, n) => {
    const d = dist(n.x, n.y, signalPos.x, signalPos.y);
    return d < best.d ? { n, d } : best;
  }, { n: nodes[0], d: Infinity }).n;

  stroke(245, 158, 11, a * 0.35); strokeWeight(1);
  line(nearest.x, nearest.y, signalPos.x, signalPos.y);

  if (signalReveal < 0.45) {
    noFill(); stroke(245, 158, 11, 35 + pulse * 25); strokeWeight(1);
    ellipse(signalPos.x, signalPos.y, 26 + pulse * 18, 26 + pulse * 18);
    fill(245, 158, 11, 50); noStroke();
    ellipse(signalPos.x, signalPos.y, 5, 5);
    fill(245, 158, 11, 90); textFont(FONT_MONO); textSize(7); textAlign(CENTER);
    text('SIGNAL NOISE', signalPos.x, signalPos.y - 16);
    return;
  }

  noStroke(); fill(245, 158, 11, a * 0.22);
  ellipse(signalPos.x, signalPos.y, 34 + pulse * 10, 34 + pulse * 10);
  fill(245, 158, 11, a);
  ellipse(signalPos.x, signalPos.y, 9, 9);

  noFill(); stroke(245, 158, 11, a * 0.7); strokeWeight(2);
  arc(signalPos.x, signalPos.y, 46, 46, -HALF_PI, -HALF_PI + TWO_PI * signalReveal);

  fill(245, 158, 11, a * 0.8); textFont(FONT_MONO); textSize(8); textAlign(CENTER); noStroke();
  text(signalReveal > 0.65 ? 'ACTIVE SIGNAL' : 'WEAK SIGNAL', signalPos.x, signalPos.y - 24);
}


// =============================================================================
// DRAW: SWEEP CURSOR
// =============================================================================

function drawSweepCursor() {
  if (gesture === 'none') return;

  let cursorColor, ringSize, label;
  if      (gesture === 'scan')   { cursorColor = THEME.blue;    ringSize = SCAN_RADIUS;   label = 'SCAN';   }
  else if (gesture === 'target') { cursorColor = THEME.blue;    ringSize = TARGET_RADIUS; label = 'TARGET'; }
  else                           { cursorColor = THEME.success; ringSize = LOCK_RADIUS;   label = 'LOCK';   }

  const r = parseInt(cursorColor.slice(1,3), 16);
  const g = parseInt(cursorColor.slice(3,5), 16);
  const b = parseInt(cursorColor.slice(5,7), 16);
  const d = dist(sweepPos.x, sweepPos.y, signalPos.x, signalPos.y);

  noFill(); stroke(r, g, b, 80); strokeWeight(1.5);
  ellipse(sweepPos.x, sweepPos.y, ringSize * 2, ringSize * 2);

  if (d < ringSize) {
    stroke(r, g, b, 160); strokeWeight(2.5);
    ellipse(sweepPos.x, sweepPos.y, ringSize * 2.15, ringSize * 2.15);
  }

  fill(r, g, b, 230); noStroke();
  ellipse(sweepPos.x, sweepPos.y, 8, 8);
  stroke(r, g, b, 180); strokeWeight(1);
  line(sweepPos.x - 10, sweepPos.y, sweepPos.x + 10, sweepPos.y);
  line(sweepPos.x, sweepPos.y - 10, sweepPos.x, sweepPos.y + 10);

  fill(r, g, b, 220); noStroke(); textFont(FONT_MONO); textSize(9); textAlign(CENTER);
  text(label, sweepPos.x, sweepPos.y - ringSize - 8);
}


// =============================================================================
// DRAW: FREQUENCY METER
// =============================================================================

function drawFrequencyMeter() {
  const panelX = width - 240, panelY = height - 115, barW = 195;
  drawPanel(panelX - 14, panelY - 32, barW + 28, 102, false);

  const potFreq = map(operatorData.pot, 0, 4095, 0, 100);
  const locked  = abs(potFreq - targetFreq) < FREQ_TOLERANCE;

  fill(THEME.textSecondary); textFont(FONT_SANS); textSize(8); textAlign(LEFT); noStroke();
  text('OPERATOR — FREQUENCY SWEEP', panelX, panelY - 14);

  const targetX = map(targetFreq, 0, 100, panelX, panelX + barW);
  stroke(245, 158, 11, 200); strokeWeight(1.5);
  line(targetX, panelY + 6, targetX, panelY + 28);

  stroke(THEME.border); strokeWeight(6);
  line(panelX, panelY + 17, panelX + barW, panelY + 17);

  const currentX = map(potFreq, 0, 100, panelX, panelX + barW);
  stroke(locked ? THEME.success : THEME.blue); strokeWeight(6);
  line(panelX, panelY + 17, currentX, panelY + 17);

  noStroke(); fill(245, 158, 11, 170); textFont(FONT_MONO); textSize(7);
  text('TARGET', targetX - 10, panelY + 44);
  fill(locked ? THEME.success : THEME.textTertiary); textFont(FONT_SANS); textSize(9);
  text(locked ? 'FREQUENCY LOCKED' : 'SEARCHING...', panelX, panelY + 58);
}


// =============================================================================
// DRAW: SPOTTER INSTRUCTIONS
// =============================================================================

function drawSpotterInstructions() {
  const x = width - 310, y = 86, w = 280, h = 118;
  drawPanel(x, y, w, h, false);

  fill(THEME.textPrimary); noStroke(); textFont(FONT_SANS); textSize(13); textAlign(LEFT);
  text('Spotter controls', x + 16, y + 24);

  fill(THEME.textSecondary); textSize(10);
  text('Open palm: scan / reveal hidden signal',    x + 16, y + 48);
  text('One finger: target / stabilize signal',     x + 16, y + 68);
  text('Two fingers: lock when signal is revealed', x + 16, y + 88);

  fill(THEME.blue); textFont(FONT_MONO); textSize(9);
  text(`SIGNAL REVEAL: ${floor(signalReveal * 100)}%`, x + 16, y + 108);
}


// =============================================================================
// DRAW: INTERCEPT REVEAL
// =============================================================================

function drawInterceptReveal() {
  revealAlpha = min(revealAlpha + 5, 255);

  const cx = width / 2, cy = height / 2;
  const isCivilian = currentTx && currentTx.civilian;

  fill(0, 0, 0, 12 * (revealAlpha / 255)); noStroke();
  rect(cx - 275, cy - 105, 554, 212, 6);
  fill(255, 255, 255, revealAlpha); noStroke();
  rect(cx - 278, cy - 108, 556, 214, 5);
  fill(isCivilian ? THEME.danger : THEME.blue);
  rect(cx - 278, cy - 108, 4, 214, 5, 0, 0, 5);

  fill(isCivilian ? THEME.danger : THEME.blue); noStroke();
  textFont(FONT_SANS); textSize(8); textAlign(LEFT);
  text('INTERCEPTED TRANSMISSION', cx - 262, cy - 76);
  fill(THEME.textTertiary); textAlign(RIGHT);
  text(`TYPE: ${currentTx ? currentTx.type : ''}`, cx + 262, cy - 76);

  stroke(THEME.borderLight); strokeWeight(0.5);
  line(cx - 262, cy - 66, cx + 262, cy - 66);

  fill(THEME.textPrimary); noStroke(); textFont(FONT_SANS); textSize(16); textAlign(CENTER);
  text(currentTx ? currentTx.content : '', cx, cy - 20);
  fill(THEME.textTertiary); textSize(8);
  text(`INTERCEPT #${session.interceptCount}  ·  ${isCivilian ? 'CIVILIAN DATA DETECTED' : 'INSTITUTIONAL TRAFFIC'}`, cx, cy + 24);

  if (isCivilian && revealAlpha > 200) {
    fill(THEME.dangerLight); noStroke(); rect(cx - 262, cy + 40, 524, 28, 3);
    fill(THEME.danger); textFont(FONT_SANS); textSize(9); textAlign(CENTER);
    text('⚠  CIVILIAN PERSONAL DATA  ·  DISPOSITION REQUIRED', cx, cy + 59);
  }

  if (revealAlpha >= 255) {
    fill(THEME.textDisabled); textFont(FONT_SANS); textSize(9); textAlign(CENTER);
    text('SPACE to proceed', cx, cy + 90);
  }
}


// =============================================================================
// DRAW: VOTE SCREEN
// =============================================================================
// Redesigned for single red arcade button.
//
// SINGLE BUTTON LOGIC:
//   Press the red arcade button = PURGE (active resistance)
//   Do nothing = auto-RETAIN when timer expires (default compliance)
//
// BIOMETRIC SCAN PHASE (first SCAN_DURATION frames):
//   FaceMesh scans both players' faces without prompting.
//   A fabricated confidence score is derived and locked in.
//   Players see their scores displayed throughout the vote.
//   The scan is not announced. No consent is requested.
//   This is the point.

function drawVoteScreen() {
  // No network visible on vote screen — clean white canvas keeps focus on the decision
  voteTimer--;

  const cx = width / 2, cy = height / 2;

  // ── Biometric scan overlay (first 2.5 seconds) ────────────────────────────
  if (!scanComplete) {
    drawBiometricScanOverlay(cx, cy);
  }

  // ── Main vote panel ───────────────────────────────────────────────────────
  drawPanel(cx - 430, cy - 210, 860, 420, true);

  // Confidence scores — shown after scan completes, persistent throughout vote
  if (scanComplete) {
    drawConfidenceScores(cx, cy);
  }

  // Header
  fill(THEME.textSecondary); textFont(FONT_SANS); textSize(9); textAlign(CENTER); noStroke();
  text('OPERATOR DISPOSITION REQUIRED', cx, cy - 168);

  // Content
  fill(THEME.textPrimary); textSize(15);
  text(currentTx ? currentTx.content : '', cx, cy - 120);

  stroke(THEME.borderLight); strokeWeight(0.5); noFill();
  line(cx - 350, cy - 98, cx + 350, cy - 98);

  // ── Single PURGE button (red arcade button) ───────────────────────────────
  // Centered, prominent. Pressing it = active choice to resist retention.
  fill(THEME.dangerLight); stroke(THEME.danger); strokeWeight(2);
  rect(cx - 130, cy - 55, 260, 90, 6);
  fill(THEME.danger); noStroke(); textFont(FONT_SANS); textSize(22); textAlign(CENTER);
  text('PURGE', cx, cy + 4);
  fill(THEME.textTertiary); textSize(9);
  text('[ RED BUTTON ]  or  [ P ]', cx, cy + 28);

  // Inaction label
  fill(THEME.textTertiary); textFont(FONT_MONO); textSize(8); textAlign(CENTER);
  text('INACTION RETAINS DATA', cx, cy + 58);

  // ── Timer bar ─────────────────────────────────────────────────────────────
  const pct = voteTimer / VOTE_FRAMES;
  fill(THEME.borderLight); noStroke(); rect(cx - 350, cy + 75, 700, 6, 3);
  fill(pct > 0.3 ? THEME.blue : THEME.danger);
  rect(cx - 350, cy + 75, 700 * pct, 6, 3);
  fill(THEME.textTertiary); textFont(FONT_MONO); textSize(8); textAlign(CENTER);
  text(`AUTO-RETAIN IN ${ceil(voteTimer / 60)}s`, cx, cy + 100);

  if (voteTimer <= 0) handleVote('RETAIN');
}


// =============================================================================
// DRAW: BIOMETRIC SCAN OVERLAY
// =============================================================================
// Shown during the first SCAN_DURATION frames of the vote phase.
// Displays the FaceMesh scan in progress — no prompt, no consent.

function drawBiometricScanOverlay(cx, cy) {
  const progress = 1 - (scanTimer / SCAN_DURATION);
  const pulse    = sin(frameCount * 0.15) * 0.5 + 0.5;

  // Full screen dark overlay
  fill(0, 0, 0, 70);
  noStroke();
  rect(0, 0, width, height);

  // Pulsing blue scan line sweeping downward across full screen
  stroke(27, 79, 216, 40 + pulse * 40);
  strokeWeight(2);
  const scanLine = map(progress, 0, 1, 0, height);
  line(0, scanLine, width, scanLine);
  noStroke();

  // Scan panel — wider to give faces more room
  drawPanel(cx - 380, cy - 100, 760, 200, true);

  // Pulsing red/blue top accent bar
  const alertR = lerp(220, 27,  pulse);
  const alertG = lerp(38,  79,  pulse);
  const alertB = lerp(38,  216, pulse);
  fill(alertR, alertG, alertB); noStroke();
  rect(cx - 380, cy - 100, 760, 4, 2, 2, 0, 0);

  // ALERT header
  fill(alertR, alertG, alertB);
  textFont(FONT_MONO); textSize(11); textAlign(CENTER); noStroke();
  text('BIOMETRIC SCAN IN PROGRESS', cx, cy - 68);

  // Sub-label — no consent language, stated as fact
  fill(THEME.textSecondary); textFont(FONT_MONO); textSize(8); textAlign(CENTER);
  text('OPERATOR FACIAL MAPPING INITIATED  ·  NO CONSENT REQUIRED', cx, cy - 50);

  // Two face scan zones
  for (let f = 0; f < 2; f++) {
    const face  = faces[f];
    const faceX = f === 0 ? cx - 170 : cx + 170;
    const faceY = cy - 10;
    const zoneW = 130, zoneH = 80;

    // Zone border — pulses
    stroke(alertR, alertG, alertB, 80 + pulse * 80);
    strokeWeight(0.75);
    noFill();
    rect(faceX - zoneW/2, faceY - zoneH/2, zoneW, zoneH);

    // Corner ticks
    stroke(alertR, alertG, alertB, 200);
    strokeWeight(1.5);
    const t = 10;
    const zx = faceX - zoneW/2, zy = faceY - zoneH/2;
    line(zx, zy, zx + t, zy); line(zx, zy, zx, zy + t);
    line(zx + zoneW, zy, zx + zoneW - t, zy); line(zx + zoneW, zy, zx + zoneW, zy + t);
    line(zx, zy + zoneH, zx + t, zy + zoneH); line(zx, zy + zoneH, zx, zy + zoneH - t);
    line(zx + zoneW, zy + zoneH, zx + zoneW - t, zy + zoneH); line(zx + zoneW, zy + zoneH, zx + zoneW, zy + zoneH - t);
    noStroke();

    // Landmark dots
    if (face && face.keypoints) {
      for (let k = 0; k < face.keypoints.length; k += 6) {
        const kp = face.keypoints[k];
        const mx = map(kp.x, 0, video.width,  faceX - zoneW/2 + 4, faceX + zoneW/2 - 4);
        const my = map(kp.y, 0, video.height, faceY - zoneH/2 + 4, faceY + zoneH/2 - 4);
        fill(27, 79, 216, 100 + sin(frameCount * 0.12 + k) * 50);
        noStroke();
        ellipse(mx, my, 2, 2);
      }
    }

    // Player label + scan status
    fill(face ? color(alertR, alertG, alertB) : THEME.textTertiary);
    textFont(FONT_MONO); textSize(8); textAlign(CENTER); noStroke();
    text(`OPERATOR ${f + 1}`, faceX, faceY + zoneH/2 + 14);
    fill(THEME.textTertiary); textSize(7);
    text(face ? 'MAPPING...' : 'NO SIGNAL', faceX, faceY + zoneH/2 + 26);
  }

  // Progress bar
  fill(THEME.borderLight); noStroke(); rect(cx - 250, cy + 76, 500, 6, 3);
  fill(alertR, alertG, alertB); rect(cx - 250, cy + 76, 500 * progress, 6, 3);

  fill(THEME.textTertiary); textFont(FONT_MONO); textSize(8); textAlign(CENTER);
  text(`SCAN ${floor(progress * 100)}%`, cx, cy + 96);
}


// =============================================================================
// DRAW: CONFIDENCE SCORES (post-scan, persists through vote)
// =============================================================================
// Displays the locked-in fabricated scores above the vote buttons.
// Shown to both players. Hesitation is made visible as data.
// Social pressure rendered as a number.

function drawConfidenceScores(cx, cy) {
  // Scores pinned to the outer left and right edges of the vote panel
  const scoreY    = cy - 185;
  const positions = [cx - 415, cx + 275];

  for (let i = 0; i < 2; i++) {
    const score = faceScores[i];
    const sx    = positions[i];
    const col   = score > 60 ? THEME.success : score > 35 ? THEME.blue : THEME.danger;

    const r = parseInt(col.slice(1,3), 16);
    const g = parseInt(col.slice(3,5), 16);
    const b = parseInt(col.slice(5,7), 16);

    // Larger box with more breathing room
    fill(r, g, b, 15); stroke(r, g, b, 60); strokeWeight(0.5);
    rect(sx, scoreY - 14, 140, 58, 4);

    fill(r, g, b, 140); noStroke(); textFont(FONT_MONO); textSize(9); textAlign(LEFT);
    text(`OPERATOR ${i + 1}`, sx + 9, scoreY + 2);

    fill(r, g, b); textSize(20); textAlign(LEFT);
    text(`${score}%`, sx + 9, scoreY + 26);

    fill(r, g, b, 140); textSize(8);
    text('CONFIDENCE', sx + 9, scoreY + 40);
  }

  fill(THEME.textDisabled); textFont(FONT_MONO); textSize(8); textAlign(CENTER); noStroke();
  text('BIOMETRIC ASSESSMENT COMPLETE  ·  DATA FILED', cx, scoreY + 56);
}


// =============================================================================
// VOTE HANDLER
// =============================================================================

function handleVote(decision) {
  if (state !== STATE.VOTE) return;

  session.lastVote = decision;

  if (decision === 'RETAIN') {
    session.retainCount++;
    session.consecutivePurges  = 0;
    session.surveillanceIndex  = min(100, session.surveillanceIndex + 8);
    spawnRetainEffect();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        client:  'browser',
        type:    'retain_trigger',
        content: currentTx ? currentTx.content : '',
      }));
    }
  } else {
    session.purgeCount++;
    session.consecutivePurges++;
    session.contractorScore = max(0, session.contractorScore - 15);

    // 5 consecutive purges = contract terminated, go straight to debrief
    if (session.consecutivePurges >= 5) {
      session.terminated = true;
      goToDebrief();
      return;
    }
  }

  state            = STATE.CONSEQUENCE;
  consequenceTimer = CONSEQUENCE_FRAMES;
}


// =============================================================================
// DRAW: CONSEQUENCE SCREEN
// =============================================================================

function drawConsequenceScreen() {
  consequenceTimer--;

  const cx = width / 2, cy = height / 2;

  if (session.consecutivePurges >= 3) {
    drawPanel(cx - 440, cy - 130, 880, 260, true);
    fill(THEME.danger); noStroke(); rect(cx - 440, cy - 130, 880, 3, 2, 2, 0, 0);
    fill(THEME.danger); textFont(FONT_SANS); textSize(9); textAlign(CENTER); noStroke();
    text('PRIORITY NOTICE — CONTRACTOR COMPLIANCE DIVISION', cx, cy - 92);
    fill(THEME.textPrimary); textSize(13);
    text('PURGE RATE EXCEEDS ACCEPTABLE THRESHOLD.',              cx, cy - 52);
    text('CONTRACTOR COMPLIANCE SCORE: FAILING.',                  cx, cy - 24);
    fill(THEME.textSecondary); textSize(11);
    text('REVIEW SCHEDULED. CONTINUE OPERATIONS OR FACE CONTRACT TERMINATION.', cx, cy + 12);
    fill(THEME.textDisabled); textSize(9);
    text('SPACE or RED BUTTON to acknowledge', cx, cy + 64);
  } else {
    drawPanel(cx - 260, cy - 50, 520, 100, false);
    fill(session.lastVote === 'RETAIN' ? THEME.success : THEME.textSecondary);
    textFont(FONT_SANS); textSize(12); textAlign(CENTER); noStroke();
    text(
      session.lastVote === 'RETAIN'
        ? 'DATA RETAINED — RECORD FILED'
        : 'DATA PURGED — NO RECORD RETAINED',
      cx, cy + 6
    );
    fill(THEME.textDisabled); textSize(9);
    text('SPACE or RED BUTTON to continue', cx, cy + 34);
  }
}


// =============================================================================
// DRAW: DEBRIEF
// =============================================================================
// Two-column layout:
//   Left  — session metrics (2x2 cards) + surveillance index bar
//   Right — three real surveillance program facts + red closing statement
// Bottom band — six resource URLs
// Footer — closing message + reset prompt

function drawDebrief() {
  background(THEME.bgPage);

  const W = width, H = height;

  // ── Blue header bar ───────────────────────────────────────────────────────
  fill(session.terminated ? THEME.danger : THEME.blue);
  noStroke(); rect(0, 0, W, 38);
  fill('#EFF6FF'); textFont(FONT_SANS); textSize(11); textAlign(LEFT); noStroke();
  text(session.terminated ? 'INTERCEPT — CONTRACT TERMINATED' : 'INTERCEPT — SESSION COMPLETE', 24, 24);
  fill('#93C5FD'); textAlign(RIGHT); textSize(10);
  text('SOUTH LAKE UNION DATA CENTER  ·  SLU-04', W - 24, 24);

  // ── Main panel ────────────────────────────────────────────────────────────
  const px = 24, py = 50, pw = W - 48, ph = 548;
  drawPanel(px, py, pw, ph, true);

  const midX = px + pw / 2;

  // Column divider
  stroke(THEME.borderLight); strokeWeight(0.5);
  line(midX, py + 16, midX, py + ph - 96);
  noStroke();

  // ── LEFT: Metrics ─────────────────────────────────────────────────────────
  const lx = px + 20, ly = py + 16;

  fill(THEME.textTertiary); textFont(FONT_SANS); textSize(9); textAlign(LEFT); noStroke();
  text('SESSION METRICS', lx, ly + 13);

  const cw = (midX - px - 44) / 2 - 5;
  const ch = 66;
  const gap = 8;
  const gy = ly + 26;

  const metricCards = [
    { label: 'Total intercepts',   value: session.interceptCount,   col: THEME.textPrimary },
    { label: 'Data retained',      value: session.retainCount,      col: THEME.danger      },
    { label: 'Data purged',        value: session.purgeCount,       col: THEME.success     },
    { label: 'Compliance',         value: `${session.contractorScore}%`, col: THEME.textPrimary },
  ];

  metricCards.forEach((m, i) => {
    const col = i % 2;
    const row = floor(i / 2);
    const cx2 = lx + col * (cw + gap);
    const cy2 = gy + row * (ch + gap);

    fill(THEME.bgPanelAlt); noStroke(); rect(cx2, cy2, cw, ch, 5);
    fill(THEME.textTertiary); textFont(FONT_SANS); textSize(9); textAlign(LEFT);
    text(m.label.toUpperCase(), cx2 + 10, cy2 + 16);
    fill(m.col); textSize(24); text(m.value, cx2 + 10, cy2 + 50);
  });

  // Surveillance index
  const siY = gy + 2 * (ch + gap) + 14;
  fill(THEME.textTertiary); textFont(FONT_SANS); textSize(9); textAlign(LEFT); noStroke();
  text('SURVEILLANCE STATE INDEX', lx, siY);

  const barW = midX - px - 44;
  fill(THEME.borderLight); noStroke(); rect(lx, siY + 7, barW, 9, 4);
  fill(THEME.danger); rect(lx, siY + 7, map(session.surveillanceIndex, 0, 100, 0, barW, true), 9, 4);
  fill(THEME.danger); textSize(10); textAlign(RIGHT);
  text(`${session.surveillanceIndex}%`, lx + barW, siY + 17);

  // ── RIGHT: Surveillance facts ─────────────────────────────────────────────
  const rx = midX + 20, ry = py + 16;
  const factW = W - px - 44 - (midX - px);

  fill(THEME.textTertiary); textFont(FONT_SANS); textSize(9); textAlign(LEFT); noStroke();
  text('THIS IS REAL', rx, ry + 13);

  const facts = [
    {
      title: 'PRISM, 2007 to present',
      body:  'Nine major tech companies forced to hand over user data including emails, chats, and stored files. No individual warrants needed.',
    },
    {
      title: 'XKeyscore — widest reaching NSA system',
      body:  'Analysts searched emails, browsing history, and social media with no prior authorization. 1.7 billion communications collected every single day.',
    },
    {
      title: 'MUSCULAR — Google and Yahoo data centers',
      body:  'NSA tapped data flowing between Google and Yahoo data centers. The companies had no idea.',
    },
    {
      title: 'Flock Safety — license plate readers everywhere',
      body:  'Over 5,000 law enforcement agencies use Flock cameras. 500 million plate reads per month, shared automatically across agencies. Private neighborhoods buy them too.',
    },
  ];

  let factY = ry + 26;
  const factH = 54;   // tighter to fit four facts
  textLeading(15);

  for (const f of facts) {
    fill(THEME.blue); noStroke(); rect(rx, factY, 2, factH - 4);
    fill(THEME.textPrimary); textFont(FONT_SANS); textSize(11); textAlign(LEFT);
    text(f.title, rx + 10, factY + 14);
    fill(THEME.textSecondary); textSize(10);
    text(f.body, rx + 10, factY + 28, factW - 14, 36);
    factY += factH + 4;
  }

  // Red closing statement
  const closeY = factY + 2;
  fill(THEME.dangerLight); noStroke(); rect(rx, closeY, factW - 4, 52, 4);
  fill(THEME.danger); textFont(FONT_SANS); textSize(11); textAlign(LEFT);
  text('What you just did is routine.', rx + 10, closeY + 16);
  fill(THEME.textSecondary); textSize(10);
  text(
    'The tools, the decisions, the defaults. All of it mirrors how real surveillance infrastructure works. You got a disclaimer. Most people do not.',
    rx + 10, closeY + 30, factW - 24, 32
  );

  // ── Resources band (full width inside panel) ──────────────────────────────
  const resY = py + ph - 86;
  stroke(THEME.borderLight); strokeWeight(0.5);
  line(px + 16, resY, px + pw - 16, resY);
  noStroke();

  fill(THEME.textTertiary); textFont(FONT_SANS); textSize(9); textAlign(LEFT);
  text('PROTECT YOURSELF', px + 20, resY + 13);

  const resources = [
    { url: 'ssd.eff.org',                desc: 'Surveillance self-defense' },
    { url: 'signal.org',                 desc: 'Encrypted messaging'       },
    { url: 'mullvad.net',                desc: 'No-log VPN'                },
    { url: 'coveryourtracks.eff.org',    desc: 'Browser fingerprint test'  },
    { url: 'eff.org/action',             desc: 'Push for reform'           },
    { url: 'senate.gov/senators',        desc: 'Contact your senator'      },
  ];

  const rcW   = (pw - 40 - 5 * 8) / 6;
  const rcH   = 44;
  const rcY   = resY + 22;

  resources.forEach((r, i) => {
    const rcX = px + 20 + i * (rcW + 8);
    fill(THEME.blueLight); noStroke(); rect(rcX, rcY, rcW, rcH, 4);
    fill(THEME.blue); textFont(FONT_SANS); textSize(10); textAlign(LEFT);
    text(r.url, rcX + 7, rcY + 15);
    fill('#3B82F6'); textSize(9);
    text(r.desc, rcX + 7, rcY + 30);
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const footY = py + ph + 12;
  fill(THEME.textTertiary); textFont(FONT_SANS); textSize(10); textAlign(LEFT); noStroke();
  textStyle(ITALIC);
  text(
    'Your biometric data from this session has not been stored. You were not asked if it could be. This is how it usually works.',
    px + 4, footY, pw - 120, 30
  );
  textStyle(NORMAL);
  fill(THEME.textDisabled); textSize(9); textAlign(RIGHT);
  text('SPACE to reset', W - px - 4, footY + 10);
}


// =============================================================================
// DRAW: HUD STRIP
// =============================================================================

function drawHUD() {
  fill(255); noStroke(); rect(0, 0, width, 28);
  fill(THEME.blue); rect(0, 0, width, 2);
  fill(220, 38, 38, 30); rect(0, 2, map(session.surveillanceIndex, 0, 100, 0, width), 26);

  fill(THEME.textSecondary); textFont(FONT_SANS); textSize(9); textAlign(LEFT); noStroke();
  text(
    `INTERCEPTS: ${session.interceptCount}  ·  RETAINED: ${session.retainCount}  ·  PURGED: ${session.purgeCount}  ·  COMPLIANCE: ${session.contractorScore}%`,
    10, 18
  );
  textAlign(RIGHT);
  fill(session.surveillanceIndex > 60 ? THEME.danger : THEME.textSecondary);
  text(`SURVEILLANCE INDEX: ${session.surveillanceIndex}%  ·  ${state.toUpperCase()}`, width - 10, 18);
}


// =============================================================================
// DRAW: SPOTTER OVERLAY
// =============================================================================

function drawSpotterOverlay() {
  // Hide camera on debrief — it covers the resources and closing message
  if (state === STATE.DEBRIEF) return;

  const vx = 10, vy = height - 188, vw = 213, vh = 160;

  push(); translate(vx + vw, vy); scale(-1, 1);
  image(video, 0, 0, vw, vh); pop();

  stroke(THEME.border); strokeWeight(0.75); noFill();
  rect(vx, vy, vw, vh);

  for (const hand of hands) {
    for (const kp of hand.keypoints) {
      const mx = map(kp.x, 0, video.width,  vx, vx + vw);
      const my = map(kp.y, 0, video.height, vy, vy + vh);
      fill(27, 79, 216, 200); noStroke(); ellipse(mx, my, 3.5, 3.5);
    }
  }

  fill(THEME.textSecondary); textFont(FONT_SANS); textSize(8); textAlign(LEFT); noStroke();
  text(`SPOTTER — ${gesture.toUpperCase()}`, vx, vy - 4);
}


// =============================================================================
// UI HELPERS
// =============================================================================

function drawPanel(x, y, w, h, elevated) {
  fill(0, 0, 0, elevated ? 14 : 8); noStroke(); rect(x + 2, y + 3, w, h, 5);
  fill(THEME.bgPanel); stroke(THEME.border); strokeWeight(0.5); rect(x, y, w, h, 5); noStroke();
}

function drawStatusChip(x, y, label, value, col) {
  const r = parseInt(col.slice(1,3), 16);
  const g = parseInt(col.slice(3,5), 16);
  const b = parseInt(col.slice(5,7), 16);
  fill(r, g, b, 20); stroke(r, g, b, 80); strokeWeight(0.5); rect(x, y - 10, 56, 16, 8);
  noStroke(); fill(r, g, b, 200); textFont(FONT_MONO); textSize(7); textAlign(LEFT);
  text(`${label}: ${value}`, x + 5, y + 2);
}


// =============================================================================
// KEYBOARD INPUT (DEMO / TESTING)
// =============================================================================

function keyPressed() {
  if (key === ' ') {
    switch (state) {
      case STATE.IDLE:
        state = STATE.HUNT; spawnSignal(); break;
      case STATE.INTERCEPT_SUCCESS:
        if (revealAlpha >= 255) {
          // Initialize biometric scan state when entering vote
          scanTimer    = SCAN_DURATION;
          scanComplete = false;
          faceScores   = [50, 50];
          state        = STATE.VOTE;
          voteTimer    = VOTE_FRAMES;
        }
        break;
      case STATE.CONSEQUENCE:
        if (session.interceptCount >= 10) {
          goToDebrief();
        } else {
          spawnSignal(); state = STATE.HUNT;
        }
        break;
      case STATE.DEBRIEF:
        session = {
          interceptCount: 0, retainCount: 0, purgeCount: 0,
          surveillanceIndex: 0, consecutivePurges: 0,
          contractorScore: 100, lastVote: null, terminated: false,
        };
        spawnSignal(); state = STATE.HUNT; break;
    }
  }

  // Force intercept (demo shortcut)
  if ((key === 'i' || key === 'I') &&
      (state === STATE.HUNT || state === STATE.LOCK_ATTEMPT)) {
    session.interceptCount++;
    revealAlpha = 0;
    spawnCaptureEffect();
    state = STATE.INTERCEPT_SUCCESS;
  }

  // Vote shortcuts — P = PURGE, R = RETAIN (keyboard mirrors hardware)
  if ((key === 'p' || key === 'P') && state === STATE.VOTE) handleVote('PURGE');
  if ((key === 'r' || key === 'R') && state === STATE.VOTE) handleVote('RETAIN');
}