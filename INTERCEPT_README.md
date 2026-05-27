# INTERCEPT: Localized Dragnet

## Overview

INTERCEPT is a 2-player interactive physical computing installation exploring mass surveillance, data retention, and the erosion of privacy through the lens of local Pacific Northwest cloud infrastructure.

Positioned as third-party data contractors working a night shift at a South Lake Union server farm, players are tasked with monitoring a "firehose" of regional data flowing through local data centers before it is routed to federal intelligence databases. The installation divides players into two asymmetric roles — Spotter and Operator — who must coordinate in real time to intercept transmissions. Neither player can complete an intercept alone. The installation forces players to physically execute surveillance sweeps, subjects them to unprompted biometric scanning, and generates a literal, physical paper trail of their privacy violations.

---

## Player Roles

### Player 1 — The Spotter
The Spotter locates and stabilizes signals on the projected network map using hand and finger gestures tracked by ml5.js HandPose via an overhead webcam. They have spatial awareness of the network but no capture ability. They are the eyes.

### Player 2 — The Operator
The Operator controls the physical panel — rotary encoder, toggle switches, and arcade buttons. They have capture ability but no spatial awareness; their display shows raw signal waveforms and frequency data but no map. They are blind without the Spotter's guidance. They are the hands.

**Neither player can see the full picture. Constant verbal communication is required.**

---

## The Experience (Gameplay Loop)

### 1. Initialization
The system is locked. To begin, a player must insert a physical floppy disk into the console. The mechanical engagement of the drive signals the Node.js backend — detecting the newly mounted USB volume via `fs.watch()` — to initialize the UI. The grinding seek noise of the floppy drive serves as secondary auditory haptics. Something important is starting, and it sounds like it.

### 2. The Hunt — Skill Phase

The network map animates to life on the main display. Signal nodes pulse across a stylized map of the Pacific Northwest data corridor. The Spotter and Operator must coordinate to intercept active transmissions.

#### Spotter Gesture Vocabulary (ml5.js HandPose)

The Spotter's hand hovers over the console surface below the overhead webcam. Three gestures control the sweep:

**Open palm, hovering** — activates a wide passive scan radius. Signals within range pulse faintly. This is the sweep gesture — slow and broad. Feels like running a hand over a surface feeling for heat.

**Index finger extended, pointing** — narrows the scan to a precise point. When the fingertip lands within threshold distance of an active signal node, the signal begins to surface: it brightens, its transmission line sharpens, and an audio tone climbs in pitch. This is the targeting gesture.

**Two fingers extended (index + middle), held steady** — locks the targeting and holds the signal in place for the Operator to act on. The signal drifts continuously across the map, so the Spotter must physically track it to maintain the lock. Losing the two-finger hold submerges the signal. The Spotter's HandPose confidence score directly feeds signal stability — tired or uncertain hands perform worse.

#### Operator Sequence (Physical Panel)

When the Spotter achieves a two-finger lock, the Operator's panel illuminates with the signal's frequency signature. A countdown begins. The Operator must complete three steps before time expires:

**Step 1 — Tune:** Rotate the rotary encoder to match the target frequency. The haptic vibration motor pulses faster as the correct value approaches — safecracking by feel. The Spotter can hear this audio feedback.

**Step 2 — Authenticate:** Throw the correct toggle switch combination. Each signal type (voice, data, encrypted) requires a different configuration across three switches. Players learn the three valid combinations quickly, but fumble under pressure.

**Step 3 — Capture:** Hit the GREEN arcade button to confirm before the countdown expires.

If any step fails, or the Spotter loses the two-finger lock mid-sequence, the signal escapes. Both players restart on a new target. A clean intercept requires simultaneous execution — no one player can rush or stall without costing the other.

### 3. The Reveal — Narrative Phase

Intercepted transmissions decode on the main display. The content follows a deliberate arc across the session:

- **Intercepts 1–4:** Noise, metadata, clearly institutional traffic. Players are just playing the game.
- **Intercepts 5–8:** Ambiguous data. Could be routine, could be personal. Players might notice.
- **Intercepts 9+:** Unmistakably civilian. Names, locations, medical search queries, transit card swipes, Capitol Hill protest location pings, text messages from a UW student.

The mechanics never change. The skill challenge remains identical throughout. Only the content shifts. Players are given no moment where the game signals that things have become serious. The realization that nothing changed except their awareness is the experience.

### 4. The Disposition — Biometric Scan

After each intercept batch, the system freezes and initiates a biometric scan without prompting. The webcam activates. ml5.js FaceMesh maps both players' facial landmarks in real time, displaying a derived **Confidence/Hesitation Score** above each player's station.

The score is a constructed proxy — calculated from brow elevation relative to eye openness and inter-frame jaw movement variance. It is presented as authoritative. This is intentional: the system fabricates a psychological readout and labels it as data, which is precisely how real behavioral scoring infrastructure operates.

During the late game, a brief mid-intercept scan is also triggered — the Spotter's hand tracking pauses for three seconds, FaceMesh activates, generates their Confidence Score, and returns control. It is not a game mechanic. It is a reminder that the system has been watching them the entire time, not just the signals.

### 5. The Vote

Players vote using their physical arcade buttons — GREEN to **RETAIN**, RED to **PURGE** the intercepted data. Both players see each other's live Confidence Score during deliberation. Hesitation is visible. This surfaces social pressure as data, mirroring how surveillance tools function in institutional contexts.

### 6. The Consequence — Retention

If the vote passes to RETAIN, the Arduino Leonardo triggers the thermal receipt printer. The intercepted citizen data prints and accumulates physically on the floor. The floppy drive grinds. The **Surveillance State Index** climbs on the main display. The paper trail is permanent and visible to anyone watching.

### 7. The Consequence — Continuous Purge

If players vote to PURGE consistently, the system does not reward them. After three consecutive purges, a priority transmission interrupts the session from a fictional federal handler:

> **PURGE RATE EXCEEDS ACCEPTABLE THRESHOLD.**  
> **CONTRACTOR COMPLIANCE SCORE: FAILING.**  
> **REVIEW SCHEDULED. CONTINUE OPERATIONS OR FACE CONTRACT TERMINATION.**

The game does not force compliance. Continued purging escalates the handler's messages in tone and frequency. Full contract termination ends the session early with a distinct debrief screen — you were fired for doing the right thing. There is no achievement. There is no congratulation. The screen simply notes your compliance score and moves on.

### 8. Difficulty Scaling

The skill challenge scales across the session in parallel with the narrative reveal:

| Phase | Signal behavior | Toggle complexity | Haptic tuning window | Simultaneous signals |
|---|---|---|---|---|
| Early (1–5) | Slow drift, large targets | 1 switch | Wide | 1 |
| Mid (6–10) | Faster drift, smaller targets | 2 switches | Narrowed | 2 |
| Late (11+) | Fast drift, overlapping nodes | 3 switches | Tight | 3 |

Players reach peak mechanical engagement exactly when the ethical content is at its heaviest. They are too focused on the task to look away from what they are capturing.

### 9. Endgame — Debrief

The display clears to a final summary:

- **TOTAL INTERCEPTS**
- **CIVILIAN DATA RETAINED**
- **CIVILIAN DATA PURGED**
- **SURVEILLANCE STATE INDEX** (final %)
- **CONTRACTOR COMPLIANCE SCORE**

A single rotating fact from a curated dataset of real surveillance programs is displayed without commentary — PRISM, XKeyscore, NSA bulk metadata collection, the Viasat attack, GCHQ Tempora. Just the program name, the date, and the scale.

Then:

> **YOUR BIOMETRIC DATA FROM THIS SESSION HAS NOT BEEN STORED.**  
> **YOU WERE NOT ASKED IF IT COULD BE.**  
> **THIS IS HOW IT USUALLY WORKS.**

The system resets. The floppy ejects. The installation waits.

---

## Technical Architecture

### 1. Hardware

#### Player Control Surfaces

| Component | Player | Purpose |
|---|---|---|
| ESP32 | Both (×2 total) | Microcontroller, WebSocket client |
| Rotary Encoder | Operator (P2) | Frequency tuning input |
| Mini DC Vibration Motor | Operator (P2) | Haptic proximity feedback under encoder |
| Heavy-Duty Toggle Switch | Operator (P2) | Signal type authentication |
| 2× Arcade Buttons (Green/Red) | Both | RETAIN / PURGE vote |
| Overhead Webcam | Spotter (P1) | HandPose gesture tracking |

#### Actuation & Physical Consequence

| Component | Purpose |
|---|---|
| Arduino Leonardo | Dedicated physical output controller |
| ESC/POS Thermal Receipt Printer | Prints intercepted data on RETAIN vote |
| Sony MPF-920 USB Floppy Drive | Session initialization key; auditory haptics |
| Wide-angle Webcam (×1) | FaceMesh biometric scan, mounted above display |

> Note: The Spotter webcam and the FaceMesh webcam may be combined into a single wide-angle unit if field of view permits both hand tracking and facial landmark detection simultaneously. This is worth testing early.

---

### 2. Software Stack

#### Node.js Bridge Server
A lightweight local Node.js process handles all WebSocket connections from both ESP32s via the `ws` package, manages serial communication to the Arduino Leonardo via `serialport`, and polls the filesystem with `fs.watch()` to detect floppy disk insertion and trigger game initialization. All ESP32 input is aggregated into a single unified stream forwarded to the p5.js frontend over a local WebSocket connection. One runtime, one place to debug.

#### Frontend UI — p5.js
Handles the main display, network map rendering, signal sweep and drift animation, Spotter sweep visualization, vote interface, Surveillance State Index, difficulty scaling logic, and all session state. Receives unified input events from the Node.js bridge over WebSocket.

#### Computer Vision — ml5.js
Runs entirely in-browser on top of TensorFlow.js. Two models active:

**HandPose** — tracks Spotter hand and finger positions against the projected map in real time. Gesture classification (open palm / index point / two-finger lock) is derived from keypoint positions and confidence thresholds. HandPose confidence score feeds directly into signal stability — degrading lock quality when hand position is uncertain.

**FaceMesh** — tracks 468 facial landmarks per player from the wide-angle webcam. Active during Disposition phases and the mid-intercept clearance scan. Confidence/Hesitation Score is derived from brow elevation, eye openness delta, and jaw movement variance. The score is a constructed proxy presented as authoritative — this is a deliberate design choice and part of the installation's critique of behavioral scoring systems.

#### Hardware Triggering
On a confirmed RETAIN vote, p5.js sends a trigger event to the Node.js bridge over local WebSocket. Node.js forwards a serial command to the Arduino Leonardo, which drives the thermal printer via ESC/POS protocol and toggles the floppy seek routine for auditory effect.

---

### 3. System Diagram

```
[ Floppy Disk Inserted ]
        |
  (fs.watch detects mount)
        |
        v
┌──────────────────────┐
│   NODE.JS BRIDGE     │<──(WebSocket)── [ Player 1 ESP32 — Spotter buttons ]
│                      │<──(WebSocket)── [ Player 2 ESP32 — Operator panel  ]
│  ws + serialport     │
│  + fs.watch          │──(WebSocket)──> [ p5.js / ml5.js Browser UI ]
└──────────────────────┘                          |
                                         (WebSocket trigger on RETAIN)
                                                  |
                                                  v
                                        [ Node.js Bridge ]
                                                  |
                                           (Serial Tx)
                                                  |
                                                  v
                                       [ Arduino Leonardo ]
                                                  |
                                     ┌────────────┴────────────┐
                                     v                         v
                             [ Thermal Printer ]       [ Floppy Seek ]
```

---

### 4. Key Dependencies

**Node.js server:**
```json
{
  "node": ">=18.0.0",
  "ws": "^8.x",
  "serialport": "^12.x"
}
```

**Browser:**
- p5.js (CDN)
- ml5.js v1.x (CDN)

**ESP32 (Arduino IDE):**
- `WebSocketsClient`
- `ArduinoJson`

---

## UI / UX Aesthetic Options

Two visual directions are available depending on which dimension of the surveillance critique the team wants to foreground:

---

### Option A — The SIGINT Bunker (Retro / Analog)

This aesthetic leans into the historical, brutalist roots of signals intelligence and offensive cyber operations.

**Visuals:** Dark, high-contrast CRT-style rendering. Deep blacks, glowing phosphor greens, amber highlights. UI elements blur slightly at the edges to simulate analog video interference and scan line artifacts.

**UI Elements:** Large digital VU meters, scrolling hexadecimal dumps, jagged waveform visualizers, Morse-style audio feedback, monospaced terminal typography throughout.

**The Vibe:** It feels like a piece of Cold War SIGINT equipment that has been aggressively modernized. Explicitly hostile, secretive, and classified. It emphasizes the espionage heritage of data collection and makes players feel like intelligence officers in a basement — complicit in something secret and serious.

**Best for:** Critiquing the *historical roots* of mass surveillance — framing modern data collection as a direct continuation of state intelligence apparatus.

---

### Option B — The Silicon Valley Dragnet (Modern / Clinical)

This aesthetic critiques contemporary, privatized data collection — the Palantir dashboard, the AWS console, the police ALPR interface.

**Visuals:** Clean, sterile, heavily vectorized. Stark white backgrounds, muted blue and crisp gray accents, sharp red for alerts. Smooth animations, drop shadows, modern sans-serif typography. Everything looks like a well-funded B2B SaaS product.

**UI Elements:** Interactive node graphs, clean tracking grids, circular progress rings, perfectly formatted citizen dossiers, compliance score meters, contractor performance dashboards.

**The Vibe:** It hides the violence of mass surveillance behind good UX design. The player is not a spy — they are a contractor doing routine data entry. The horror is in how normal it feels. The contrast between the sterile interface and the thermal paper accumulating on the floor is where the installation's meaning lives.

**Best for:** Critiquing the *privatization and normalization* of surveillance infrastructure — foregrounding how modern data collection is indistinguishable from ordinary tech work.

---

*Recommendation: Option B lands harder in a public showcase context. The gap between the sterile UI and the physical paper trail on the floor is the installation's sharpest moment.*
