// src/App.jsx
import { useEffect, useState, useMemo } from "react";
import { db } from "./firebase";
import { ref, onValue, query, orderByChild, startAt } from "firebase/database";
import ToggleSwitch from "./components/ToggleSwitch";
import TemperatureChart from "./components/TemperatureChart";
import "./App.css";

const SENSORS_PATH = "sensors/latest";
const HISTORY_PATH = "sensors/history";
const COMMANDS_PATH = "commands/device1";
const DEVICE_ID = "device1";

const DAY_MS = 24 * 60 * 60 * 1000;
const FAN_THRESHOLD = 26;
const PUMP_ON_LEVEL = 15;

function parseYesNo(value) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  const v = String(value).toUpperCase();
  return v === "YES" || v === "TRUE" || v === "1";
}

export default function App() {
  const [sensors, setSensors] = useState({ temp: null, hum: null, mq135: false, mq2: false, distance: null, ts: null });
  const [commands, setCommands] = useState({ fan: null, pump: null, buzzer: null });
  const [history, setHistory] = useState([]); // array of objects
  const [loadingHistory, setLoadingHistory] = useState(true);

  // live sensors
  useEffect(() => {
    const sensorsRef = ref(db, SENSORS_PATH);
    const un1 = onValue(sensorsRef, snap => {
      const d = snap.val();
      if (!d) { setSensors(prev => ({ ...prev, ts: null })); return; }
      setSensors({
        temp: d.temp ?? null,
        hum: d.hum ?? null,
        mq135: parseYesNo(d.mq135),
        mq2: parseYesNo(d.mq2),
        distance: d.distance ?? null,
        ts: d.ts ?? Date.now()
      });
    });

    const cmdRef = ref(db, COMMANDS_PATH);
    const un2 = onValue(cmdRef, snap => {
      const d = snap.val();
      if (!d) { setCommands({ fan: null, pump: null, buzzer: null }); return; }
      setCommands({
        fan: Object.prototype.hasOwnProperty.call(d, "fan") ? (d.fan === null ? null : !!d.fan) : null,
        pump: Object.prototype.hasOwnProperty.call(d, "pump") ? (d.pump === null ? null : !!d.pump) : null,
        buzzer: Object.prototype.hasOwnProperty.call(d, "buzzer") ? (d.buzzer === null ? null : !!d.buzzer) : null
      });
    });

    return () => { un1(); un2(); };
  }, []);

  // history: last 24 hours
  useEffect(() => {
    setLoadingHistory(true);
    const now = Date.now();
    const q = query(ref(db, HISTORY_PATH), orderByChild("ts"), startAt(now - DAY_MS));
    const unsub = onValue(q, snap => {
      const d = snap.val();
      if (!d) {
        setHistory([]);
        setLoadingHistory(false);
        return;
      }
      // convert to sorted array by ts
      const arr = Object.values(d).map(x => ({
        temp: x.temp ?? null,
        hum: x.hum ?? null,
        mq135: x.mq135 ?? "NO",
        mq2: x.mq2 ?? "NO",
        distance: x.distance ?? null,
        fan: x.fan ?? 0,
        pump: x.pump ?? 0,
        buzzer: x.buzzer ?? 0,
        ts: typeof x.ts === "number" ? x.ts : Number(x.ts)
      })).sort((a,b) => a.ts - b.ts);
      setHistory(arr);
      setLoadingHistory(false);
    });
    return () => unsub();
  }, []);

  // write command helper (same as before)
  const sendCommand = (key, value) => {
    // build full object to write
    const newCmd = {
      fan: commands.fan,
      pump: commands.pump,
      buzzer: commands.buzzer,
      ts: Date.now(),
      device: DEVICE_ID
    };
    newCmd[key] = value;
    // write
    import("firebase/database").then(({ set, ref: dbRef }) => {
      // dynamic import to avoid top-level mixing; but we can just use set/ref via earlier import - kept simple
    });
    // simpler: use global set/ref imported at top (we didn't import 'set' earlier) — use this:
    // to avoid dependency changes, use the old approach: write via db API using onValue code; but easiest is to use window? To keep simple, assume set is imported at top normally.
  };

  // Effective (what the device should be doing)
  const effective = useMemo(() => {
    const fan = commands.fan !== null ? commands.fan : (sensors.temp !== null && sensors.temp > FAN_THRESHOLD);
    const pump = commands.pump !== null ? commands.pump : (sensors.distance !== null && sensors.distance > PUMP_ON_LEVEL);
    const buz = commands.buzzer !== null ? commands.buzzer : (sensors.mq135 || sensors.mq2);
    return { fan: !!fan, pump: !!pump, buzzer: !!buz };
  }, [commands, sensors]);

  // ANALYTICS from history
  const analytics = useMemo(() => {
    if (!history || history.length === 0) return {
      avgTemp: null, gasCount: 0, pumpOnMinutes: 0, fanOnMinutes: 0, alertCount: 0
    };

    // average temp
    const temps = history.filter(h => h.temp !== null).map(h => Number(h.temp));
    const avgTemp = temps.length ? (temps.reduce((a,b)=>a+b,0)/temps.length) : null;

    // gas detection count
    const gasCount = history.reduce((acc,h) => acc + ((h.mq2 === "YES" || h.mq135 === "YES") ? 1 : 0), 0);

    // compute durations (pump and fan) in minutes by summing intervals where previous state is ON
    let pumpMs = 0, fanMs = 0;
    for (let i = 1; i < history.length; i++) {
      const prev = history[i-1], cur = history[i];
      const dt = Math.max(0, cur.ts - prev.ts);
      if (prev.pump === 1) pumpMs += dt;
      if (prev.fan === 1) fanMs += dt;
    }
    // if last entry shows ON, add small remaining interval up to now
    const last = history[history.length-1];
    const now = Date.now();
    const lastInterval = Math.max(0, now - last.ts);
    if (last.pump === 1) pumpMs += lastInterval;
    if (last.fan === 1) fanMs += lastInterval;

    const pumpOnMinutes = +(pumpMs / 60000).toFixed(2);
    const fanOnMinutes = +(fanMs / 60000).toFixed(2);

    // alert frequency per day — gasCount normalized (history is last 24h so equals per day)
    const alertCount = gasCount;

    return { avgTemp: avgTemp === null ? null : +avgTemp.toFixed(2), gasCount, pumpOnMinutes, fanOnMinutes, alertCount };
  }, [history]);

  // prepare chart data (temperature points)
  const tempSeries = useMemo(() => history.filter(h => h.temp !== null).map(h => ({ ts: h.ts, temp: Number(h.temp) })), [history]);

  // online indicator
  const lastUpdate = sensors.ts;
  const isOnline = lastUpdate && (Date.now() - lastUpdate < 20_000); // 20s threshold
  const formatTimeAgo = ts => {
    if (!ts) return "No data";
    const diff = Math.floor((Date.now() - ts)/1000);
    if (diff < 5) return "just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    return new Date(ts).toLocaleString();
  };

  // Fix sendCommand implementation (write to firebase)
  // import set & ref at top would have been cleaner; use direct import here:
  const doSendCommand = (key, value) => {
    // create object copying existing keys but with updated key
    const obj = {
      fan: commands.fan,
      pump: commands.pump,
      buzzer: commands.buzzer,
      ts: Date.now(),
      device: DEVICE_ID
    };
    obj[key] = value;
    // write using the db reference
    import("firebase/database").then(({ set, ref: dbRef }) => {
      set(dbRef(db, COMMANDS_PATH), obj).catch(err => console.error("Command write error:", err));
    });
  };

  // Reset to auto
  const resetToAuto = async () => {
    try {
      const { set, ref: dbRef } = await import("firebase/database");
      await set(dbRef(db, COMMANDS_PATH), null);
      setCommands({ fan: null, pump: null, buzzer: null });
    } catch (e) {
      console.error(e);
    }
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
        <section className="card left-main">
          <div className="cards-row">
            {/* Sensor cards (left column) */}
            <div className="sensor-grid">
              <div className="sensor-card">
                <div className="sensor-title">🌡 Temperature</div>
                <div className="sensor-value">{sensors.temp===null?"—":`${sensors.temp} °C`}</div>
                <div className="sensor-sub">Industrial Fan auto ON if &gt; {FAN_THRESHOLD}°C</div>
              </div>
              <div className="sensor-card">
                <div className="sensor-title">💧 Humidity</div>
                <div className="sensor-value">{sensors.hum===null?"—":`${sensors.hum} %`}</div>
                <div className="sensor-sub">Monitored for environment stability</div>
              </div>
              <div className={`sensor-card gas ${sensors.mq135?"danger":""}`}>
                <div className="sensor-title">⚠ MQ135 (Air pollutants)</div>
                <div className="sensor-value">{sensors.mq135? "YES":"NO"}</div>
                <div className="sensor-sub">Exhaust Fan & Buzzer triggered if YES</div>
              </div>
              <div className={`sensor-card gas ${sensors.mq2?"danger":""}`}>
                <div className="sensor-title">🔥 MQ2 (Flammable gas)</div>
                <div className="sensor-value">{sensors.mq2? "YES":"NO"}</div>
                <div className="sensor-sub">Exhaust Fan & Buzzer triggered if YES</div>
              </div>
              <div className="sensor-card">
                <div className="sensor-title">📏 Fluid Level</div>
                <div className="sensor-value">{sensors.distance===null?"—":`${sensors.distance} cm`}</div>
                <div className="sensor-sub">Pump auto ON if level &gt; {PUMP_ON_LEVEL} cm</div>
              </div>
            </div>

            {/* Chart & analytics */}
            <div className="chart-analytics">
              <div className="card">
                <h2>Temperature (24h)</h2>
                {loadingHistory ? <div>Loading history...</div> : <TemperatureChart data={tempSeries} />}
              </div>

              <div className="analytics-row">
                <div className="analytic">
                  <div className="analytic-title">Avg Temp (24h)</div>
                  <div className="analytic-value">{analytics.avgTemp===null?"—":analytics.avgTemp + " °C"}</div>
                </div>

                <div className="analytic">
                  <div className="analytic-title">Gas Alerts (24h)</div>
                  <div className="analytic-value">{analytics.gasCount}</div>
                </div>

                <div className="analytic">
                  <div className="analytic-title">Pump ON (min)</div>
                  <div className="analytic-value">{analytics.pumpOnMinutes}</div>
                </div>

                <div className="analytic">
                  <div className="analytic-title">Fan ON (min)</div>
                  <div className="analytic-value">{analytics.fanOnMinutes}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="right-col">
          <section className="card actuators">
            <h2>Actuators & Manual Controls</h2>
            <div className="control-grid">
              <div className={`control-card ${commands.fan !== null ? "manual-on" : ""}`}>
                <h3>Industrial Fan</h3>
                <p className="subtext">{commands.fan === null ? `AUTO (threshold ${FAN_THRESHOLD}°C)` : (commands.fan ? "MANUAL ON" : "MANUAL OFF")}</p>
                <ToggleSwitch checked={commands.fan ?? false} onChange={(v)=>doSendCommand("fan", v)} label={commands.fan === null ? "AUTO" : commands.fan ? "ON":"OFF"} />
              </div>

              <div className={`control-card ${commands.pump !== null ? "manual-on" : ""}`}>
                <h3>Pump</h3>
                <p className="subtext">{commands.pump === null ? `AUTO (level > ${PUMP_ON_LEVEL}cm)` : (commands.pump ? "MANUAL ON" : "MANUAL OFF")}</p>
                <ToggleSwitch checked={commands.pump ?? false} onChange={(v)=>doSendCommand("pump", v)} label={commands.pump === null ? "AUTO" : commands.pump ? "ON":"OFF"} />
              </div>

              <div className={`control-card ${commands.buzzer !== null ? "manual-on gas-alert" : "gas-alert"}`}>
                <h3>Exhaust Fan + Buzzer</h3>
                <p className="subtext">{commands.buzzer === null ? "AUTO (gas detection)" : (commands.buzzer ? "MANUAL ON" : "MANUAL OFF")}</p>
                <ToggleSwitch checked={commands.buzzer ?? false} onChange={(v)=>doSendCommand("buzzer", v)} label={commands.buzzer === null ? "AUTO" : commands.buzzer ? "ON":"OFF"} />
              </div>
            </div>

            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button className="primary" onClick={resetToAuto}>Reset to Auto</button>
            </div>
          </section>

          <section className="card actuator-status" style={{ marginTop: 16 }}>
            <h2>RTOS / Actuator Status</h2>
            <div className="status-list">
              <div className="status-item"><div>Industrial Fan</div><div className={`badge ${effective.fan ? "on":"off"}`}>{effective.fan ? "ON":"OFF"}</div></div>
              <div className="status-item"><div>Pump</div><div className={`badge ${effective.pump ? "on":"off"}`}>{effective.pump ? "ON":"OFF"}</div></div>
              <div className="status-item"><div>Exhaust + Buzzer</div><div className={`badge ${effective.buzzer ? "on":"off"}`}>{effective.buzzer ? "ON":"OFF"}</div></div>
            </div>
            <div className="small-note">Status is computed from current sensor values + manual overrides.</div>
          </section>
        </aside>
      </main>

      <footer className="footer">
        <small>Connected device: <strong>{DEVICE_ID}</strong></small>
      </footer>
    </div>
  );
}
