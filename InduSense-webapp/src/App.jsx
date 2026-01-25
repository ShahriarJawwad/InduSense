// src/App.jsx
import { useEffect, useState, useMemo } from "react";
import { db } from "./firebase";
import { ref, onValue, set } from "firebase/database";
import ToggleSwitch from "./components/ToggleSwitch";
import "./App.css";

const SENSORS_PATH = "sensors/latest";
const COMMANDS_PATH = "commands/device1";
const DEVICE_ID = "device1";

const FAN_THRESHOLD = 26;
const PUMP_ON_LEVEL = 15; // same as ESP32
const PUMP_OFF_LEVEL = 10;

function parseYesNo(value) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  const v = String(value).toUpperCase();
  return v === "YES" || v === "TRUE" || v === "1";
}

export default function App() {
  const [sensors, setSensors] = useState({
    temp: null,
    hum: null,
    mq135: false,
    mq2: false,
    distance: null,
    ts: null,
  });

  // commands may be true/false or null (null => auto)
  const [commands, setCommands] = useState({
    fan: null,
    pump: null,
    buzzer: null,
  });

  // listen to sensors & commands
  useEffect(() => {
    const sensorsRef = ref(db, SENSORS_PATH);
    const unsubSensors = onValue(sensorsRef, (snap) => {
      const d = snap.val();
      if (!d) {
        // no data
        setSensors((prev) => ({ ...prev, ts: null }));
        return;
      }
      setSensors({
        temp: d.temp ?? null,
        hum: d.hum ?? null,
        mq135: parseYesNo(d.mq135),
        mq2: parseYesNo(d.mq2),
        distance: d.distance ?? null,
        ts: d.ts ?? Date.now(),
      });
    });

    const commandsRef = ref(db, COMMANDS_PATH);
    const unsubCmd = onValue(commandsRef, (snap) => {
      const d = snap.val();
      if (!d) {
        // null -> auto mode
        setCommands({ fan: null, pump: null, buzzer: null });
        return;
      }
      // preserve null when key missing
      setCommands({
        fan: Object.prototype.hasOwnProperty.call(d, "fan") ? (d.fan === null ? null : !!d.fan) : null,
        pump: Object.prototype.hasOwnProperty.call(d, "pump") ? (d.pump === null ? null : !!d.pump) : null,
        buzzer: Object.prototype.hasOwnProperty.call(d, "buzzer") ? (d.buzzer === null ? null : !!d.buzzer) : null,
      });
    });

    return () => {
      unsubSensors();
      unsubCmd();
    };
  }, []);

  // write commands to Firebase (manual toggles)
  const sendCommand = (key, value) => {
    // value is boolean (true/false). We write that key while preserving other keys.
    // Build partial update object by reading current commands (we will write full object)
    const newCmd = {
      fan: commands.fan,
      pump: commands.pump,
      buzzer: commands.buzzer,
      ts: Date.now(),
      device: DEVICE_ID,
    };
    newCmd[key] = value; // set boolean
    set(ref(db, COMMANDS_PATH), newCmd)
      .then(() => {
        setCommands((prev) => ({ ...prev, [key]: value }));
      })
      .catch((err) => console.error("Command write error:", err));
  };

  // Reset to Auto (clears manual overrides)
  const resetToAuto = async () => {
    try {
      await set(ref(db, COMMANDS_PATH), null);
      setCommands({ fan: null, pump: null, buzzer: null });
    } catch (e) {
      console.error("Reset failed", e);
    }
  };

  // Last update & online status
  const lastUpdate = sensors.ts;
  const isOnline = lastUpdate && Date.now() - lastUpdate < 15000; // online if updated within 15s

  // Compute effective actuator states (what ESP32 should be using)
  const effective = useMemo(() => {
    // Fan: if command is not null -> use it, else auto by temp
    const fanOn = commands.fan !== null ? commands.fan : (sensors.temp !== null && sensors.temp > FAN_THRESHOLD);
    const pumpOn = commands.pump !== null ? commands.pump : (sensors.distance !== null && sensors.distance > PUMP_ON_LEVEL);
    const buzzerOn = commands.buzzer !== null ? commands.buzzer : (sensors.mq135 || sensors.mq2);
    return { fan: !!fanOn, pump: !!pumpOn, buzzer: !!buzzerOn };
  }, [commands, sensors]);

  const gasAlert = sensors.mq135 || sensors.mq2;

  const formatTimeAgo = (ts) => {
    if (!ts) return "No data";
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5) return "just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="container">
      <header className="header">
        <div className="header-left">
          <h1>InduSense</h1>
          <p className="subtitle">Industrial Environment Dashboard</p>
        </div>

        <div className="status-bar">
          <div className={`status-pill ${isOnline ? "online" : "offline"}`}>
            {isOnline ? "System: ONLINE" : "System: OFFLINE"}
          </div>
          <div className="status-info">Last: {formatTimeAgo(lastUpdate)}</div>
        </div>
      </header>

      <main className="grid">
        <section className="card sensors">
          <h2>Sensor Readings</h2>

          <div className="sensor-grid">
            <div className="sensor-card">
              <div className="sensor-title">🌡 Temperature</div>
              <div className="sensor-value">
                {sensors.temp === null ? "—" : `${sensors.temp} °C`}
              </div>
              <div className="sensor-sub">Industrial Fan auto ON if &gt; {FAN_THRESHOLD}°C</div>
            </div>

            <div className="sensor-card">
              <div className="sensor-title">💧 Humidity</div>
              <div className="sensor-value">
                {sensors.hum === null ? "—" : `${sensors.hum} %`}
              </div>
              <div className="sensor-sub">Monitored for environment stability</div>
            </div>

            <div className={`sensor-card gas ${sensors.mq135 ? "danger" : ""}`}>
              <div className="sensor-title">⚠ MQ135 (Air pollutants)</div>
              <div className="sensor-value">{sensors.mq135 ? "YES" : "NO"}</div>
              <div className="sensor-sub">Exhaust Fan & Buzzer triggered if YES</div>
            </div>

            <div className={`sensor-card gas ${sensors.mq2 ? "danger" : ""}`}>
              <div className="sensor-title">🔥 MQ2 (Flammable gas)</div>
              <div className="sensor-value">{sensors.mq2 ? "YES" : "NO"}</div>
              <div className="sensor-sub">Exhaust Fan & Buzzer triggered if YES</div>
            </div>

            <div className="sensor-card">
              <div className="sensor-title">📏 Fluid Level</div>
              <div className="sensor-value">
                {sensors.distance === null ? "—" : `${sensors.distance} cm`}
              </div>
              <div className="sensor-sub">Pump auto ON if level &gt; {PUMP_ON_LEVEL} cm</div>
            </div>
          </div>

          {gasAlert && (
            <div className="alert">⚠ Gas detected! Take immediate action.</div>
          )}
        </section>

        <aside className="right-col">
          <section className="card actuators">
            <h2>Actuators & Manual Controls</h2>

            <div className="control-grid">
              <div className={`control-card ${commands.fan !== null ? "manual-on" : ""}`}>
                <h3>Industrial Fan</h3>
                <p className="subtext">{commands.fan === null ? `AUTO (threshold ${FAN_THRESHOLD}°C)` : (commands.fan ? "MANUAL ON" : "MANUAL OFF")}</p>
                <ToggleSwitch
                  checked={commands.fan ?? false}
                  onChange={(v) => sendCommand("fan", v)}
                  label={commands.fan === null ? "AUTO" : commands.fan ? "ON" : "OFF"}
                />
              </div>

              <div className={`control-card ${commands.pump !== null ? "manual-on" : ""}`}>
                <h3>Pump</h3>
                <p className="subtext">{commands.pump === null ? `AUTO (level > ${PUMP_ON_LEVEL}cm)` : (commands.pump ? "MANUAL ON" : "MANUAL OFF")}</p>
                <ToggleSwitch
                  checked={commands.pump ?? false}
                  onChange={(v) => sendCommand("pump", v)}
                  label={commands.pump === null ? "AUTO" : commands.pump ? "ON" : "OFF"}
                />
              </div>

              <div className={`control-card ${commands.buzzer !== null ? "manual-on gas-alert" : "gas-alert"}`}>
                <h3>Exhaust Fan + Buzzer</h3>
                <p className="subtext">{commands.buzzer === null ? "AUTO (gas detection)" : (commands.buzzer ? "MANUAL ON" : "MANUAL OFF")}</p>
                <ToggleSwitch
                  checked={commands.buzzer ?? false}
                  onChange={(v) => sendCommand("buzzer", v)}
                  label={commands.buzzer === null ? "AUTO" : commands.buzzer ? "ON" : "OFF"}
                />
              </div>
            </div>

            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button className="primary" onClick={resetToAuto}>Reset to Auto</button>
            </div>
          </section>

          <section className="card actuator-status" style={{ marginTop: 16 }}>
            <h2>RTOS / Actuator Status</h2>
            <div className="status-list">
              <div className="status-item">
                <div>Industrial Fan</div>
                <div className={`badge ${effective.fan ? "on" : "off"}`}>{effective.fan ? "ON" : "OFF"}</div>
              </div>
              <div className="status-item">
                <div>Pump</div>
                <div className={`badge ${effective.pump ? "on" : "off"}`}>{effective.pump ? "ON" : "OFF"}</div>
              </div>
              <div className="status-item">
                <div>Exhaust + Buzzer</div>
                <div className={`badge ${effective.buzzer ? "on" : "off"}`}>{effective.buzzer ? "ON" : "OFF"}</div>
              </div>
            </div>
            <div className="small-note">Status is computed from current sensor values + manual overrides (shows what the device should be doing).</div>
          </section>
        </aside>
      </main>

      <footer className="footer">
        <small>Connected device: <strong>{DEVICE_ID}</strong></small>
      </footer>
    </div>
  );
}
