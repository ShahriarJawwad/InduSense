// InduSense - ESP32 with Firebase REST + NTP timestamp
// Requires ArduinoJson v6

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

#include <Wire.h>
#include <DHT.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ================= OLED CONFIG =================
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ================= DHT22 CONFIG =================
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// ================= MQ SENSORS =================
#define MQ135_PIN 34
#define MQ2_PIN   35
#define MQ135_THRESHOLD 1000
#define MQ2_THRESHOLD   500

// ================= HC-SR04 CONFIG =================
#define TRIG_PIN 5
#define ECHO_PIN 18
#define PUMP_ON_LEVEL 5
#define PUMP_OFF_LEVEL 2.5

// ================= RELAY CONFIG =================
#define RELAY_FAN 26
#define RELAY_PUMP 27
#define RELAY_GAS 33
#define BUZZER_PIN 25

// ================= NETWORK / FIREBASE =================
const char* ssid = "shahriar";
const char* password = "00000000";
const char* firebaseHost = "indusense-9ecf4-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* deviceId = "device1";

// Firebase paths
const char* thresholdPath = "/ml/thresholds/fan"; // <- new ML threshold path

// ================= TIMERS =================
unsigned long lastPostMillis = 0;
unsigned long lastPollMillis = 0;
unsigned long lastThresholdMillis = 0;

const unsigned long POST_INTERVAL = 5000;       // send sensor data every 5s
const unsigned long POLL_INTERVAL = 2000;       // poll manual commands every 2s
const unsigned long THRESHOLD_INTERVAL = 5000;  // read adaptive threshold every 5s

// ================= STATE =================
bool pumpState = false;

// Adaptive threshold from Firebase
float adaptiveTempThreshold = 33.0;   // fallback value

// Manual override flags
bool overrideFan = false;
bool overrideFanVal = false;
bool overridePump = false;
bool overridePumpVal = false;
bool overrideBuzzer = false;
bool overrideBuzzerVal = false;

WiFiClientSecure client;
HTTPClient http;

// ======= helper: read distance =======
long readDistanceCM() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return -1;
  return duration * 0.034 / 2;
}

// ======= parse boolean from JSON variant =======
bool parseJsonBool(JsonVariant v, bool &hasValue) {
  if (v.isNull()) {
    hasValue = false;
    return false;
  }

  hasValue = true;

  if (v.is<bool>()) return v.as<bool>();

  const char* s = v.as<const char*>();
  if (!s) return false;

  String S = String(s);
  S.toLowerCase();
  return (S == "yes" || S == "true" || S == "1" || S == "on");
}

// ======= read adaptive threshold from Firebase =======
void fetchAdaptiveThreshold() {
  String url = String("https://") + firebaseHost + thresholdPath + ".json";

  http.begin(client, url);
  int code = http.GET();

  if (code == HTTP_CODE_OK) {
    String payload = http.getString();
    payload.trim();
    payload.replace("\"", ""); // in case Firebase stores it as string

    if (payload.length() > 0 && payload != "null") {
      float val = payload.toFloat();

      // sanity check
      if (val >= 10.0 && val <= 60.0) {
        adaptiveTempThreshold = val;
        Serial.print("Adaptive Threshold Updated: ");
        Serial.println(adaptiveTempThreshold);
      }
    }
  } else {
    Serial.print("Threshold GET failed, code = ");
    Serial.println(code);
  }

  http.end();
}

// ======= POST sensors with epoch timestamp via NTP =======
void postSensorData(float temperature, float humidity, bool mq135Detected, bool mq2Detected, long distance) {
  StaticJsonDocument<256> doc;

  if (!isnan(temperature)) doc["temp"] = temperature;
  if (!isnan(humidity)) doc["hum"] = humidity;

  doc["mq135"] = mq135Detected ? "YES" : "NO";
  doc["mq2"]   = mq2Detected ? "YES" : "NO";

  if (distance >= 0) doc["distance"] = distance;

  // include current adaptive threshold too
  doc["tempThreshold"] = adaptiveTempThreshold;

  time_t nowSec = time(NULL);
  unsigned long long tsMillis = 0ULL;

  if (nowSec > 1600000000) tsMillis = (unsigned long long)nowSec * 1000ULL;
  else tsMillis = (unsigned long long)millis();

  doc["ts"] = tsMillis;

  String body;
  serializeJson(doc, body);

  String url = String("https://") + firebaseHost + "/sensors/latest.json";

  Serial.print("PUT -> ");
  Serial.println(url);
  Serial.println(body);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.PUT(body);
  Serial.print("HTTP PUT code: ");
  Serial.println(httpCode);
  http.end();
}

// ======= POST sensors to HISTORY (append, time-series) =======
void postSensorHistory(float temperature, float humidity,
                       bool mq135Detected, bool mq2Detected,
                       long distance) {

  StaticJsonDocument<256> doc;

  if (!isnan(temperature)) doc["temp"] = temperature;
  if (!isnan(humidity)) doc["hum"] = humidity;

  doc["mq135"] = mq135Detected ? "YES" : "NO";
  doc["mq2"]   = mq2Detected ? "YES" : "NO";

  if (distance >= 0) doc["distance"] = distance;

  // actuator states
  doc["fan"]    = digitalRead(RELAY_FAN) == LOW ? 1 : 0;
  doc["pump"]   = digitalRead(RELAY_PUMP) == HIGH ? 1 : 0;
  doc["buzzer"] = digitalRead(BUZZER_PIN) == HIGH ? 1 : 0;

  // current threshold
  doc["tempThreshold"] = adaptiveTempThreshold;

  time_t nowSec = time(NULL);
  unsigned long long tsMillis =
    (nowSec > 1600000000)
    ? (unsigned long long)nowSec * 1000ULL
    : (unsigned long long)millis();

  doc["ts"] = tsMillis;

  String body;
  serializeJson(doc, body);

  String url = String("https://") + firebaseHost + "/sensors/history.json";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(body);
  Serial.print("HISTORY POST code: ");
  Serial.println(httpCode);

  http.end();
}

// ======= Poll commands =======
void pollCommands() {
  String url = String("https://") + firebaseHost + "/commands/" + deviceId + ".json";

  http.begin(client, url);
  int code = http.GET();

  if (code == HTTP_CODE_OK) {
    String payload = http.getString();
    Serial.print("Commands JSON: ");
    Serial.println(payload);

    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (!err) {
      JsonVariant v;

      v = doc["fan"];
      bool hasFan;
      bool fanVal = parseJsonBool(v, hasFan);
      if (hasFan) {
        overrideFan = true;
        overrideFanVal = fanVal;
      } else overrideFan = false;

      v = doc["pump"];
      bool hasPump;
      bool pumpVal = parseJsonBool(v, hasPump);
      if (hasPump) {
        overridePump = true;
        overridePumpVal = pumpVal;
      } else overridePump = false;

      v = doc["buzzer"];
      bool hasBuzzer;
      bool buzVal = parseJsonBool(v, hasBuzzer);
      if (hasBuzzer) {
        overrideBuzzer = true;
        overrideBuzzerVal = buzVal;
      } else overrideBuzzer = false;
    } else {
      Serial.print("JSON parse error: ");
      Serial.println(err.c_str());
    }
  } else {
    Serial.print("Commands GET failed, code=");
    Serial.println(code);
  }

  http.end();
}

// ======= apply actuators =======
void applyActuators(float temperature, long distance, bool mq135Detected, bool mq2Detected) {
  // FAN
  if (overrideFan) {
    digitalWrite(RELAY_FAN, overrideFanVal ? LOW : HIGH);
  } else {
    if (!isnan(temperature) && temperature > adaptiveTempThreshold) {
      digitalWrite(RELAY_FAN, LOW);   // ON
    } else {
      digitalWrite(RELAY_FAN, HIGH);  // OFF
    }
  }

  // PUMP
  if (overridePump) {
    digitalWrite(RELAY_PUMP, overridePumpVal ? LOW : HIGH);
  } else {
    if (distance != -1) {
      if (distance < PUMP_OFF_LEVEL) pumpState = true;
      else if (distance > PUMP_ON_LEVEL) pumpState = false;
    } else {
      pumpState = false;
    }
    digitalWrite(RELAY_PUMP, pumpState ? HIGH : LOW);
  }

  // BUZZER + GAS RELAY
  if (overrideBuzzer) {
    digitalWrite(RELAY_GAS, overrideBuzzerVal ? LOW : HIGH);
    digitalWrite(BUZZER_PIN, overrideBuzzerVal ? HIGH : LOW);
  } else {
    bool gas = mq135Detected || mq2Detected;
    digitalWrite(RELAY_GAS, gas ? LOW : HIGH);
    digitalWrite(BUZZER_PIN, gas ? HIGH : LOW);
  }
}

// ======= setup with NTP sync =======
void setup() {
  Serial.begin(115200);
  delay(100);

  dht.begin();

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  pinMode(RELAY_FAN, OUTPUT);
  pinMode(RELAY_PUMP, OUTPUT);
  pinMode(RELAY_GAS, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(RELAY_FAN, HIGH);
  digitalWrite(RELAY_PUMP, HIGH);
  digitalWrite(RELAY_GAS, HIGH);

  Wire.begin(21, 22);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED not found");
    while (1);
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("ESP32 Monitoring System");
  display.println("Starting...");
  display.display();
  delay(1000);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
    if (millis() - wifiStart > 20000) break;
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi IP: ");
    Serial.println(WiFi.localIP());

    display.clearDisplay();
    display.setCursor(0, 0);
    display.print("WiFi IP: ");
    display.println(WiFi.localIP());
    display.display();
  } else {
    Serial.println("WiFi failed");

    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("WiFi failed");
    display.display();
  }

  // set up NTP (UTC)
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  Serial.print("Waiting for NTP");
  unsigned long tstart = millis();
  while (time(NULL) < 1600000000) {
    delay(500);
    Serial.print(".");
    if (millis() - tstart > 8000) break;
  }
  Serial.println();

  if (time(NULL) >= 1600000000) Serial.println("NTP time obtained");
  else Serial.println("NTP not ready, will send millis() as fallback");

  client.setInsecure(); // prototype only

  // fetch threshold immediately at boot
  fetchAdaptiveThreshold();
}

// ======= main loop =======
void loop() {
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  int mq135Value = analogRead(MQ135_PIN);
  bool mq135Detected = mq135Value > MQ135_THRESHOLD;

  int mq2Value = analogRead(MQ2_PIN);
  bool mq2Detected = mq2Value > MQ2_THRESHOLD;

  long distance = readDistanceCM();

  // display
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);

  if (!isnan(temperature) && !isnan(humidity)) {
    display.print("T: ");
    display.print(temperature);
    display.println("C");
    display.print("H: ");
    display.print(humidity);
    display.println("%");
  } else {
    display.println("DHT Error");
  }

  display.print("Thr: ");
  display.println(adaptiveTempThreshold, 1);

  display.setCursor(0, 24);
  display.print("MQ135: ");
  display.println(mq135Detected ? "YES" : "NO");

  display.print("MQ2  : ");
  display.println(mq2Detected ? "YES" : "NO");

  display.setTextSize(2);
  display.setCursor(0, 46);
  display.print("LVL:");
  if (distance != -1) display.print(distance);
  else display.print("ERR");
  display.display();

  unsigned long now = millis();

  // read threshold from Firebase
  if (now - lastThresholdMillis > THRESHOLD_INTERVAL) {
    lastThresholdMillis = now;
    fetchAdaptiveThreshold();
  }

  // poll manual commands
  if (now - lastPollMillis > POLL_INTERVAL) {
    lastPollMillis = now;
    pollCommands();
  }

  // apply control
  applyActuators(temperature, distance, mq135Detected, mq2Detected);

  // post sensor data
  if (now - lastPostMillis > POST_INTERVAL) {
    lastPostMillis = now;

    postSensorData(
      temperature,
      humidity,
      mq135Detected,
      mq2Detected,
      distance
    );

    postSensorHistory(
      temperature,
      humidity,
      mq135Detected,
      mq2Detected,
      distance
    );
  }

  Serial.print("Temp Thr = ");
  Serial.println(adaptiveTempThreshold);

  Serial.println("------------------------------------");
  delay(200);
}