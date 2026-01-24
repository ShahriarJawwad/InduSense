// src/App.jsx
import { useEffect, useState } from "react";
import { db } from "./firebase";
import { ref, onValue, set } from "firebase/database";
import ToggleSwitch from "./components/ToggleSwitch";
import "./App.css";

const SENSORS_PATH = "sensors/latest";
const COMMANDS_PATH = "commands/device1";
const DEVICE_ID = "device1"; // used for writing commands (optional)

function parseYesNo(value) {
  // accepts true/false or "YES"/"NO" or "Yes"/"No"
  if (typeof value === "boolean") return value;
  if (!value && value !== 0) return false;
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
  });

  const [commands, setCommands] = useState({
    fan: false,
    pump: false,
    buzzer: false,
  });

  // listen to sensors & commands
  useEffect(() => {
    const sensorsRef = ref(db, SENSORS_PATH);
    const onSensors = onValue(sensorsRef, (snap) => {
      const d = snap.val();
      if (!d) return;
      setSensors({
        temp: d.temp ?? null,
        hum: d.hum ?? null,
        mq135: parseYesNo(d.mq135),
        mq2: parseYesNo(d.mq2),
        distance: d.distance ?? null,
      });
    });

    const commandsRef = ref(db, COMMANDS_PATH);
    const onCmd = onValue(commandsRef, (snap) => {
      const d = snap.val();
      if (!d) return;
      setCommands({
        fan: !!d.fan,
        pump: !!d.pump,
        buzzer: !!d.buzzer,
      });
    });

    // cleanup
    return () => {
      onSensors();
      onCmd();
    };
  }, []);

  // write commands to Firebase
  const sendCommand = (key, value) => {
    const newCmd = { ...commands, [key]: !!value, ts: Date.now(), device: DEVICE_ID };
    set(ref(db, COMMANDS_PATH), newCmd)
      .then(() => setCommands(newCmd))
      .catch((err) => console.error("Command write error:", err));
  };

  // helper UI values
  const gasAlert = sensors.mq135 || sensors.mq2;

  return (
    <div className="container">
      <header className="header">
        <h1>InduSense — Industrial Environment Dashboard</h1>
        <p className="subtitle">Realtime monitoring and manual control</p>
      </header>

      <main className="grid">
        {/* Sensors Card */}
        <section className="card sensors">
          <h2>Sensor Readings</h2>

          <div className="sensor-row">
            <div className="sensor">
              <div className="sensor-title">🌡 Temperature</div>
              <div className="sensor-value">{sensors.temp ?? "—"} °C</div>
            </div>

            <div className="sensor">
              <div className="sensor-title">💧 Humidity</div>
              <div className="sensor-value">{sensors.hum ?? "—"} %</div>
            </div>

            <div className={`sensor gas ${gasAlert ? "danger" : ""}`}>
              <div className="sensor-title">⚠ MQ135 (Air pollutants)</div>
              <div className="sensor-value">{sensors.mq135 ? "YES" : "NO"}</div>
            </div>

            <div className={`sensor gas ${sensors.mq2 ? "danger" : ""}`}>
              <div className="sensor-title">🔥 MQ2 (Flammable gas)</div>
              <div className="sensor-value">{sensors.mq2 ? "YES" : "NO"}</div>
            </div>

            <div className="sensor">
              <div className="sensor-title">📏 Fluid level</div>
              <div className="sensor-value">
                {sensors.distance === null ? "—" : `${sensors.distance} cm`}
              </div>
            </div>
          </div>

          {gasAlert && (
            <div className="alert">
              Gas detected! Please investigate immediately.
            </div>
          )}
        </section>

        {/* Actuators Card */}
        <section className="card actuators">
          <h2>Manual Controls</h2>

          <div className="control-row">
            <div className="control">
              <div className="control-info">
                <div className="control-title">Fan</div>
                <div className="control-sub">Auto on > {26}°C (ESP logic)</div>
              </div>
              <ToggleSwitch
                checked={commands.fan}
                onChange={(v) => sendCommand("fan", v)}
              />
            </div>

            <div className="control">
              <div className="control-info">
                <div className="control-title">Pump</div>
                <div className="control-sub">Level-based auto control exists on ESP32</div>
              </div>
              <ToggleSwitch
                checked={commands.pump}
                onChange={(v) => sendCommand("pump", v)}
              />
            </div>

            <div className="control">
              <div className="control-info">
                <div className="control-title">Buzzer / Gas alert</div>
                <div className="control-sub">Manual override</div>
              </div>
              <ToggleSwitch
                checked={commands.buzzer}
                onChange={(v) => sendCommand("buzzer", v)}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              className="primary"
              onClick={() => {
                // quick reset: turn everything off
                sendCommand("fan", false);
                sendCommand("pump", false);
                sendCommand("buzzer", false);
              }}
            >
              Reset All
            </button>
          </div>
        </section>
      </main>

      <footer className="footer">
        <small>Connected device: <strong>{DEVICE_ID}</strong></small>
      </footer>
    </div>
  );
}
