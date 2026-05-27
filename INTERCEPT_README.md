# INTERCEPT: Localized Dragnet

## Overview

INTERCEPT is a 2-player interactive physical computing installation exploring mass surveillance, data retention, and the erosion of privacy through the lens of local Pacific Northwest cloud infrastructure.

Positioned as third-party data contractors working a night shift at a South Lake Union server farm, players are tasked with monitoring a "firehose" of regional data flowing through local data centers before it is routed to federal intelligence databases. The installation forces players to physically execute surveillance sweeps, subjects them to unprompted biometric scanning, and generates a literal, physical paper trail of their privacy violations.

---

## The Experience (Gameplay Loop)

### 1. Initialization
The system is locked. To begin, a player must insert a physical floppy disk into the console. The mechanical engagement of the drive signals the Node.js backend to detect the newly mounted USB volume and initialize the UI. The grinding seek noise of the drive serves as secondary auditory haptics — something important is starting, and it sounds like it.

### 2. The Hunt
Players use analog rotary encoders to sweep across a digital frequency band rendered on the main display. Active haptic feedback via rumble motors mounted under each encoder indicates proximity to a live transmission. Locking onto a signal requires holding the sweep position steady and throwing the toggle switch — a deliberate two-step physical action that mirrors the intentionality of the act.

### 3. The Reveal
Intercepted signals decode on-screen into highly localized civilian data — location pings near a Capitol Hill protest, text messages from a UW student, medical search queries, transit card swipes. The data is mundane. It is also real-feeling in its specificity. Players are not intercepting enemy communications. They never were.

### 4. The Disposition — Biometric Scan
After each intercept batch, the system freezes and initiates a biometric scan without prompting. The webcam activates. ml5.js FaceMesh maps both players' facial landmarks in real time, displaying a derived **Confidence/Hesitation Score** above each player's station — a proxy metric calculated from brow position, eye openness, and jaw tension. The score is a simulation. It is presented as authoritative. This is intentional: the system is fabricating a psychological readout and labeling it as data, which is precisely how real behavioral scoring infrastructure operates.

### 5. The Vote
Players must vote using their physical arcade buttons — GREEN to **RETAIN**, RED to **PURGE** the intercepted civilian data. Majority rules. Both players see each other's Confidence Score in real time during deliberation, surfacing hesitation as visible information and creating mild social pressure — another direct mirror of how surveillance tools function in institutional contexts.

### 6. The Consequence — Retention
If the vote passes to RETAIN, the Arduino Leonardo triggers the thermal receipt printer. The citizen's intercepted data prints physically and accumulates on the floor. The floppy drive grinds aggressively. The Surveillance State Index climbs on the main display. The paper trail is permanent and visible to anyone watching the installation.

### 7. The Consequence — Continuous Purge
If players vote to PURGE consistently across multiple rounds, the system does not reward them. After three consecutive purges, a priority transmission interrupts the session — a message from a fictional federal handler:

> **PURGE RATE EXCEEDS ACCEPTABLE THRESHOLD.**  
> **CONTRACTOR COMPLIANCE SCORE: FAILING.**  
> **REVIEW SCHEDULED. CONTINUE OPERATIONS OR FACE CONTRACT TERMINATION.**

The game does not force compliance. But it makes the cost of resistance legible. Players must choose between their contractor role and their conscience, with no clean exit. Continued purging escalates the handler's messages in tone. Contract termination triggers a session-end screen that reads differently from a normal debrief — you were fired for doing the right thing.

### 8. Endgame — Debrief
At session end, the display clears to a final summary:

- **TOTAL INTERCEPTS**
- **CIVILIAN DATA RETAINED**
- **CIVILIAN DATA PURGED**
- **SURVEILLANCE STATE INDEX** (final %)
- **CONTRACTOR COMPLIANCE SCORE**

A single rotating fact from a curated dataset of real surveillance programs is displayed — PRISM, XKeyscore, NSA bulk metadata collection, the Viasat attack, GCHQ Tempora — without commentary. Just the program name, the date, and the scale.

Then:

> **YOUR BIOMETRIC DATA FROM THIS SESSION HAS NOT BEEN STORED.**  
> **YOU WERE NOT ASKED IF IT COULD BE.**  
> **THIS IS HOW IT USUALLY WORKS.**

The system resets. The floppy drive ejects. The installation waits.

---

## Technical Architecture

### 1. Hardware

#### Player Control Surfaces (×2, one per player)
| Component | Purpose |
|---|---|
| ESP32 | Microcontroller, WebSocket client |
| Rotary Encoder | Frequency sweep input |
| Mini DC Vibration Motor | Haptic feedback under encoder |
| Heavy-Duty Toggle Switch | Signal lock confirmation |
| 2× Arcade Push Buttons (Green/Red) | RETAIN / PURGE vote |

#### Actuation & Physical Consequence
| Component | Purpose |
|---|---|
| Arduino Leonardo | Dedicated physical output controller |
| ESC/POS Thermal Receipt Printer | Prints intercepted data on RETAIN vote |
| Sony MPF-920 USB Floppy Drive | Session initialization key; auditory haptics |
| Wide-angle Webcam (×1) | FaceMesh biometric scan, mounted above display |

---

### 2. Software Stack

#### Node.js Bridge Server
A lightweight local Node.js process is the connective tissue of the installation. It handles all WebSocket connections from both ESP32s using the `ws` package, manages serial communication to the Arduino Leonardo via `serialport`, and polls the OS filesystem with `fs.watch()` to detect floppy disk insertion and trigger game initialization. All ESP32 input is aggregated into a single, clean data stream forwarded to the p5.js frontend over a local WebSocket connection. This collapses the middleware layer to a single runtime environment, keeping debugging fast and the stack shallow.

#### Frontend UI — p5.js
Handles the main display, network map rendering, signal sweep visualization, vote interface, Surveillance State Index, and all session state logic. Receives unified input events from the Node.js bridge over WebSocket.

#### Computer Vision — ml5.js (FaceMesh)
Runs entirely in-browser. The FaceMesh model tracks 468 facial landmarks per player from the single wide-angle webcam feed. A custom scoring function derives the Confidence/Hesitation metric from landmark deltas — specifically brow elevation relative to eye openness and inter-frame jaw movement variance. The score is a constructed proxy, not a ground-truth emotional readout. This is by design and constitutes part of the installation's critique.

#### Hardware Triggering
On a confirmed RETAIN vote, the p5.js frontend sends a trigger event to the Node.js bridge over the local WebSocket, which forwards a serial command to the Arduino Leonardo. The Leonardo drives the thermal printer via ESC/POS serial protocol and toggles the floppy drive seek routine for auditory effect.

---

### 3. System Diagram

```
[ Floppy Disk Inserted ]
        |
  (fs.watch detects mount)
        |
        v
┌─────────────────────┐
│   NODE.JS BRIDGE    │ <──(WebSocket)── [ Player 1 ESP32 ]
│                     │ <──(WebSocket)── [ Player 2 ESP32 ]
│  ws + serialport    │
│  + fs.watch         │ ──(WebSocket)──> [ p5.js / ml5.js Browser UI ]
└─────────────────────┘                          |
                                          (WebSocket trigger)
                                                 |
                                                 v
                                        [ Node.js Bridge ]
                                                 |
                                          (Serial Tx)
                                                 |
                                                 v
                                       [ Arduino Leonardo ]
                                                 |
                                          (ESC/POS Serial)
                                                 |
                                                 v
                                       [ Thermal Printer ]
```

---

### 4. Key Dependencies

```json
{
  "node": ">=18.0.0",
  "ws": "^8.x",
  "serialport": "^12.x"
}
```

Browser:
- p5.js (CDN)
- ml5.js v1.x (CDN)

ESP32 (Arduino):
- `WebSocketsClient` library
- `ArduinoJson` library

---

## UI / UX Aesthetic Options

Two visual directions are available depending on which dimension of the surveillance critique the team wants to foreground:

---

### Option A — The SIGINT Bunker (Retro / Analog)

This aesthetic leans into the historical, brutalist roots of signals intelligence and offensive cyber operations.

**Visuals:** Dark, high-contrast CRT-style rendering. Deep blacks, glowing phosphor greens, amber highlights. UI elements blur slightly at the edges to simulate analog video interference and scan line artifacts.

**UI Elements:** Large digital VU meters, scrolling hexadecimal dumps, jagged waveform visualizers, Morse-style audio feedback, monospaced terminal typography throughout.

**The Vibe:** It feels like a piece of Cold War SIGINT equipment that has been aggressively modernized. Explicitly hostile, secretive, and classified. It emphasizes the espionage heritage of data collection and makes the player feel like an intelligence officer in a basement — complicit in something secret and serious.

**Best for:** Critiquing the *historical roots* of mass surveillance — framing modern data collection as a direct continuation of state intelligence apparatus.

---

### Option B — The Silicon Valley Dragnet (Modern / Clinical)

This aesthetic critiques contemporary, privatized data collection — the Palantir dashboard, the AWS console, the police ALPR interface.

**Visuals:** Clean, sterile, heavily vectorized. Stark white backgrounds, muted blue and crisp gray accents, sharp red for alerts. Smooth animations, drop shadows, modern sans-serif typography. Everything looks like a well-funded B2B SaaS product.

**UI Elements:** Interactive node graphs, clean tracking grids, circular progress rings, perfectly formatted citizen dossiers, compliance score meters, contractor performance dashboards.

**The Vibe:** It hides the violence of mass surveillance behind good UX design. It feels bureaucratic, sanitized, and efficient. The player is not a spy — they are a contractor doing routine data entry. The horror is in how normal it feels. The contrast between the clean interface and the thermal paper accumulating on the floor is where the installation's meaning lives.

**Best for:** Critiquing the *privatization and normalization* of surveillance infrastructure — foregrounding how modern data collection is indistinguishable from ordinary tech work.

---

*Recommendation: Option B lands harder in a public showcase context. The gap between the sterile UI and the physical paper trail on the floor is the installation's sharpest moment.*
