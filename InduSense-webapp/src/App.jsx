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

  <div className="sensor-grid">
    {/* Temperature */}
    <div className="sensor-card">
      <div className="sensor-title">🌡 Temperature</div>
      <div className="sensor-value">
        {sensors.temp === null ? "—" : `${sensors.temp} °C`}
      </div>
      <div className="sensor-sub">
        Industrial Fan auto ON if &gt; 26°C
      </div>
    </div>

    {/* Humidity */}
    <div className="sensor-card">
      <div className="sensor-title">💧 Humidity</div>
      <div className="sensor-value">
        {sensors.hum === null ? "—" : `${sensors.hum} %`}
      </div>
      <div className="sensor-sub">Monitored for environment stability</div>
    </div>

    {/* MQ135 */}
    <div className={`sensor-card gas ${sensors.mq135 ? "danger" : ""}`}>
      <div className="sensor-title">⚠ MQ135 (Air pollutants)</div>
      <div className="sensor-value">{sensors.mq135 ? "YES" : "NO"}</div>
      <div className="sensor-sub">Exhaust Fan & Buzzer triggered if YES</div>
    </div>

    {/* MQ2 */}
    <div className={`sensor-card gas ${sensors.mq2 ? "danger" : ""}`}>
      <div className="sensor-title">🔥 MQ2 (Flammable gas)</div>
      <div className="sensor-value">{sensors.mq2 ? "YES" : "NO"}</div>
      <div className="sensor-sub">Exhaust Fan & Buzzer triggered if YES</div>
    </div>

    {/* Fluid Level */}
    <div className="sensor-card">
      <div className="sensor-title">📏 Fluid Level</div>
      <div className="sensor-value">
        {sensors.distance === null ? "—" : `${sensors.distance} cm`}
      </div>
      <div className="sensor-sub">
        Pump auto ON if fluid level high
      </div>
    </div>
  </div>

  { (sensors.mq135 || sensors.mq2) && (
    <div className="alert">
      ⚠ Gas detected! Take immediate action.
    </div>
  )}
</section>


{/* Actuators Card */}
<section className="card actuators">
  <h2>Actuators & Manual Controls</h2>

  <div className="control-grid">
    {/* Industrial Fan */}
    <div className={`control-card ${commands.fan ? "manual-on" : ""}`}>
      <h3>Industrial Fan</h3>
      <p className="subtext">Auto ON if Temp &gt; 26°C</p>
      <ToggleSwitch
        checked={commands.fan ?? false}
        onChange={(v) => sendCommand("fan", v)}
        label={commands.fan === null ? "AUTO" : commands.fan ? "ON" : "OFF"}
      />
    </div>

    {/* Pump */}
    <div className={`control-card ${commands.pump ? "manual-on" : ""}`}>
      <h3>Pump</h3>
      <p className="subtext">Auto ON if fluid level high</p>
      <ToggleSwitch
        checked={commands.pump ?? false}
        onChange={(v) => sendCommand("pump", v)}
        label={commands.pump === null ? "AUTO" : commands.pump ? "ON" : "OFF"}
      />
    </div>

    {/* Exhaust Fan + Buzzer */}
    <div className={`control-card gas-alert ${commands.buzzer ? "manual-on" : ""}`}>
      <h3>Exhaust Fan + Buzzer</h3>
      <p className="subtext">Gas detected (MQ2/MQ135)</p>
      <ToggleSwitch
        checked={commands.buzzer ?? false}
        onChange={(v) => sendCommand("buzzer", v)}
        label={commands.buzzer === null ? "AUTO" : commands.buzzer ? "ON" : "OFF"}
      />
    </div>
  </div>

  {/* Reset to Auto Button */}
<div style={{ marginTop: 16 }}>
  <button
    className="primary"
    onClick={() => {
      // Reset all manual commands to null → ESP32 auto resumes
      set(ref(db, COMMANDS_PATH), null)
        .then(() => {
          setCommands({ fan: false, pump: false, buzzer: false });
        })
        .catch(err => console.error(err));
    }}
  >
    Reset to Auto
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
