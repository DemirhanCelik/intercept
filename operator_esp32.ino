// =============================================================================
// operator_esp32.ino — INTERCEPT: Localized Dragnet
// =============================================================================
// Firmware for the Operator's physical control panel.
// Runs on an Adafruit ESP32-S3 Feather (4MB Flash, 2MB PSRAM).
//
// WHAT THIS DOES:
//   - Reads the potentiometer (frequency sweep dial)
//   - Reads the toggle switch (signal lock confirmation)
//   - Reads the RETAIN and PURGE arcade buttons
//   - Sends all values to the Node.js bridge as JSON over WebSocket
//   - Receives haptic intensity commands back and drives the vibration motor
//
// HOW IT FITS INTO THE SYSTEM:
//   This board → (WiFi WebSocket) → server.js → (WebSocket) → sketch.js
//
// WIRING:
//   Pot left leg    → 3.3V
//   Pot right leg   → GND
//   Pot middle/wiper→ A0
//
//   Motor +         → 3.3V
//   Motor -         → PN2222 collector
//   PN2222 emitter  → GND
//   PN2222 base     → 1kΩ → pin 5
//   1N4001 diode    → across motor leads (cathode/stripe toward 3.3V)
//
//   Toggle switch   → pin 6, other leg → GND  (uses INPUT_PULLUP)
//   RETAIN button   → pin 7, other leg → GND  (uses INPUT_PULLUP)
//   PURGE button    → pin 8, other leg → GND  (uses INPUT_PULLUP)
//   Piezo buzzer    → pin 10, other leg → GND
//
// IMPORTANT — ADC2/WiFi conflict on ESP32-S3:
//   When WiFi is active, ADC2 is unusable. Only use ADC1 pins for analog reads.
//   On the Adafruit ESP32-S3 Feather, A0–A4 are safe ADC1 pins.
//   DO NOT use A5 or higher for analog reads in this sketch.
//
// REQUIRED LIBRARIES (install via Arduino Library Manager):
//   - WebSockets by Markus Sattler
//   - ArduinoJson by Benoit Blanchon
// =============================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>


// =============================================================================
// CONFIGURATION — UPDATE BEFORE FLASHING
// =============================================================================

const char* WIFI_SSID     = "YOUR_WIFI_SSID";      // your network name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";   // your network password

// IP address of the laptop running server.js
// Find it with: ipconfig getifaddr en0   (macOS)
//               hostname -I              (Linux)
// Must be on the same WiFi network as this ESP32
const char* WS_HOST = "192.168.1.X";
const int   WS_PORT = 8080;


// =============================================================================
// PIN DEFINITIONS
// =============================================================================
// Using ADC1 pins only (A0–A4) for the potentiometer.
// Buttons use INPUT_PULLUP — they read HIGH when unpressed, LOW when pressed.

const int POT_PIN    = A0;  // 10k panel mount potentiometer — frequency sweep
const int HAPTIC_PIN = 5;   // vibration motor via PN2222 transistor
const int TOGGLE_PIN = 6;   // toggle switch — signal lock confirmation
const int RETAIN_PIN = 7;   // green LED arcade button — RETAIN vote
const int PURGE_PIN  = 8;   // red tactile button — PURGE vote
const int BUZZER_PIN = 10;  // piezo buzzer — optional audio feedback


// =============================================================================
// TIMING
// =============================================================================

const int SEND_INTERVAL_MS = 50;    // send sensor data 20 times per second
unsigned long lastSendTime = 0;


// =============================================================================
// BUTTON STATE (DEBOUNCE / RISING EDGE)
// =============================================================================
// We only want to fire a vote event once per button press, not continuously
// while the button is held. So we track the previous state and only send
// a 'true' value on the rising edge (unpressed → pressed transition).

bool lastToggle = false;
bool lastRetain = false;
bool lastPurge  = false;


// =============================================================================
// HAPTIC STATE
// =============================================================================
// The game sends haptic intensity (0.0–1.0) while a lock is being attempted.
// We pulse the motor for a fixed duration per command rather than
// running it continuously, which prevents overheating.

int           hapticPWM = 0;       // current PWM value being applied
unsigned long hapticEnd = 0;       // millis() timestamp when pulse ends


// =============================================================================
// WEBSOCKET CLIENT
// =============================================================================

WebSocketsClient wsClient;
bool wsConnected = false;

// Called by the WebSocketsClient library on every connection event
void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {

    case WStype_CONNECTED:
      wsConnected = true;
      Serial.println("[WS] Connected to bridge");
      // Tell the bridge which client type we are so it routes correctly
      wsClient.sendTXT("{\"client\":\"esp32_operator\",\"type\":\"hello\"}");
      break;

    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println("[WS] Disconnected — will retry");
      break;

    case WStype_TEXT: {
      // Parse incoming JSON commands from the bridge
      // Currently only handles { type: 'haptic', intensity: 0.0–1.0 }
      StaticJsonDocument<128> doc;
      DeserializationError err = deserializeJson(doc, payload, length);
      if (err) break;

      if (strcmp(doc["type"], "haptic") == 0) {
        float intensity = doc["intensity"] | 0.0f;

        // Map 0.0–1.0 to 0–220 PWM
        // Cap at 220 (not 255) to avoid motor stall current at full duty cycle
        hapticPWM = (int)(intensity * 220);
        hapticEnd = millis() + 120;   // pulse for 120 milliseconds
      }
      break;
    }

    default: break;
  }
}


// =============================================================================
// SETUP
// =============================================================================
// Runs once on power-up. Initializes pins, WiFi, and WebSocket client.

void setup() {
  Serial.begin(115200);
  delay(500);  // short delay for serial monitor to attach
  Serial.println("\n[INTERCEPT] Operator panel starting...");

  // ── Pin modes ──────────────────────────────────────────────────────────────
  analogReadResolution(12);           // 12-bit ADC: values 0–4095
  pinMode(TOGGLE_PIN, INPUT_PULLUP);  // active LOW: reads LOW when thrown
  pinMode(RETAIN_PIN, INPUT_PULLUP);
  pinMode(PURGE_PIN,  INPUT_PULLUP);
  pinMode(HAPTIC_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // ── WiFi connection ────────────────────────────────────────────────────────
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Connecting to ");
  Serial.print(WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("[WiFi] Connected — IP: ");
  Serial.println(WiFi.localIP());

  // ── WebSocket client ────────────────────────────────────────────────────────
  wsClient.begin(WS_HOST, WS_PORT, "/");
  wsClient.onEvent(wsEvent);
  wsClient.setReconnectInterval(3000);        // retry every 3s if disconnected
  wsClient.enableHeartbeat(15000, 3000, 2);   // ping every 15s, 2 retries

  Serial.println("[INTERCEPT] Operator panel ready");
}


// =============================================================================
// LOOP
// =============================================================================
// Runs continuously. Handles WebSocket communication, haptic output,
// and periodic sensor data transmission.

void loop() {
  // Must be called every loop iteration to handle WebSocket events
  wsClient.loop();

  // ── Haptic motor control ──────────────────────────────────────────────────
  // Apply PWM to the motor while within the pulse window, then turn it off
  if (hapticPWM > 0 && millis() < hapticEnd) {
    analogWrite(HAPTIC_PIN, hapticPWM);
  } else {
    analogWrite(HAPTIC_PIN, 0);
    hapticPWM = 0;
  }

  // ── Sensor data transmission ──────────────────────────────────────────────
  // Only send if connected, and only at the configured interval (20hz)
  if (!wsConnected) return;
  if (millis() - lastSendTime < SEND_INTERVAL_MS) return;
  lastSendTime = millis();

  // Read all sensors
  int  potVal = analogRead(POT_PIN);

  // INPUT_PULLUP means the pin reads HIGH when unpressed, LOW when pressed
  // We invert with ! so true = active/pressed (more intuitive in the game logic)
  bool toggle = !digitalRead(TOGGLE_PIN);
  bool retain = !digitalRead(RETAIN_PIN);
  bool purge  = !digitalRead(PURGE_PIN);

  // Rising edge detection for buttons — only fire true on the frame
  // the button transitions from not-pressed to pressed.
  // This prevents a single button hold from triggering multiple votes.
  bool retainEdge = retain && !lastRetain;
  bool purgeEdge  = purge  && !lastPurge;

  // Update previous state for next iteration
  lastToggle = toggle;
  lastRetain = retain;
  lastPurge  = purge;

  // ── Build and send JSON payload ───────────────────────────────────────────
  // Schema:
  //   client: identifies this sender to the bridge router
  //   type:   'input' = regular sensor data
  //   pot:    0–4095 raw ADC value (game maps this to 0–100 frequency scale)
  //   toggle: bool — is the lock toggle switch thrown?
  //   retain: bool — rising edge only, true for one packet on press
  //   purge:  bool — rising edge only, true for one packet on press

  StaticJsonDocument<192> doc;
  doc["client"] = "esp32_operator";
  doc["type"]   = "input";
  doc["pot"]    = potVal;
  doc["toggle"] = toggle;
  doc["retain"] = retainEdge;
  doc["purge"]  = purgeEdge;

  String out;
  serializeJson(doc, out);
  wsClient.sendTXT(out);
}
