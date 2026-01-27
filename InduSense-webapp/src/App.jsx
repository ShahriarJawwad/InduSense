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
const FAN_THRESHOLD = 27;
const PUMP_ON_LEVEL = 5;   // cm
const TANK_HEIGHT = 6;     // cm

function parseYesNo(value) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  const v = String(value).toUpperCase();
  return v === "YES" || v === "TRUE" || v === "1";
}

export default function App() {
  const [sensors, setSensors] = useState({ temp: null, hum: null, mq135: false, mq2: false, distance: null, ts: null });
  const [commands, setCommands] = useState({ fan: null, pump: null, buzzer: null });
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const effective = useMemo(() => {
    const fan = commands.fan !== null ? commands.fan : (sensors.temp !== null && sensors.temp > FAN_THRESHOLD);
    const pump = commands.pump !== null? commands.pump : (sensors.distance !== null && sensors.distance >= PUMP_ON_LEVEL);
    const buz = commands.buzzer !== null ? commands.buzzer : (sensors.mq135 || sensors.mq2);
    return { fan: !!fan, pump: !!pump, buzzer: !!buz };
  }, [commands, sensors]);

  const analytics = useMemo(() => {
    if (!history || history.length === 0) return {
      avgTemp: null, gasCount: 0, pumpOnMinutes: 0, fanOnMinutes: 0, alertCount: 0
    };

    const temps = history.filter(h => h.temp !== null).map(h => Number(h.temp));
    const avgTemp = temps.length ? (temps.reduce((a,b)=>a+b,0)/temps.length) : null;
    const gasCount = history.reduce((acc,h) => acc + ((h.mq2 === "YES" || h.mq135 === "YES") ? 1 : 0), 0);

    let pumpMs = 0, fanMs = 0;
    for (let i = 1; i < history.length; i++) {
      const prev = history[i-1], cur = history[i];
      const dt = Math.max(0, cur.ts - prev.ts);
      if (prev.pump === 1) pumpMs += dt;
      if (prev.fan === 1) fanMs += dt;
    }
    const last = history[history.length-1];
    const now = Date.now();
    const lastInterval = Math.max(0, now - last.ts);
    if (last.pump === 1) pumpMs += lastInterval;
    if (last.fan === 1) fanMs += lastInterval;

    const pumpOnMinutes = +(pumpMs / 60000).toFixed(2);
    const fanOnMinutes = +(fanMs / 60000).toFixed(2);

    return { avgTemp: avgTemp === null ? null : +avgTemp.toFixed(2), gasCount, pumpOnMinutes, fanOnMinutes, alertCount: gasCount };
  }, [history]);

  const tempSeries = useMemo(() => history.filter(h => h.temp !== null).map(h => ({ ts: h.ts, temp: Number(h.temp) })), [history]);

  const lastUpdate = sensors.ts;
  const isOnline = lastUpdate && (Date.now() - lastUpdate < 20_000);
  const formatTimeAgo = ts => {
    if (!ts) return "No data";
    const diff = Math.floor((Date.now() - ts)/1000);
    if (diff < 5) return "just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    return new Date(ts).toLocaleString();
  };

  const doSendCommand = (key, value) => {
    const obj = {
      fan: commands.fan,
      pump: commands.pump,
      buzzer: commands.buzzer,
      ts: Date.now(),
      device: DEVICE_ID
    };
    obj[key] = value;
    import("firebase/database").then(({ set, ref: dbRef }) => {
      set(dbRef(db, COMMANDS_PATH), obj).catch(err => console.error("Command write error:", err));
    });
  };

  const resetToAuto = async () => {
    try {
      const { set, ref: dbRef } = await import("firebase/database");
      await set(dbRef(db, COMMANDS_PATH), null);
      setCommands({ fan: null, pump: null, buzzer: null });
    } catch (e) {
      console.error(e);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setIsRefreshing(false);
  };

  const isManualMode = commands.fan !== null || commands.pump !== null || commands.buzzer !== null;
  const gasDetected = sensors.mq135 || sensors.mq2;
  const fanShouldBeOn = sensors.temp !== null && sensors.temp > FAN_THRESHOLD;
  const fanWarning = fanShouldBeOn && !effective.fan;
  const pumpShouldBeOn = sensors.distance !== null && sensors.distance > PUMP_ON_LEVEL;
  const pumpWarning = pumpShouldBeOn && !effective.pump;
  
// -------- Fluid percentage calculation --------
const fluidPercentage = useMemo(() => {
  if (sensors.distance === null) return null;

  const d = sensors.distance;

  // clamp
  const clamped = Math.min(Math.max(d, 0), TANK_HEIGHT);

  // mapping: 6cm = 0%, 2cm = 80%, 1cm = 100%
  if (clamped >= 6) return 0;
  if (clamped <= 1) return 100;
  if (clamped <= 2) return 80;

  // linear mapping between 6cm → 0% and 1cm → 100%
  const percent = ((TANK_HEIGHT - clamped) / (TANK_HEIGHT - 1)) * 100;
  return Math.round(percent);
}, [sensors.distance]);

  return (
    <div className="container">
      <header className="header">
        <div className="header-content">
          <div className="title-section">
            <h1 className="main-title">InduSense</h1>
            <p className="subtitle">Smart Industrial Environment Monitoring & Control System</p>
          </div>
          
          <div className="header-controls">
            <button 
              className={`refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <svg className="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2"/>
              </svg>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>

            <div className={`mode-indicator ${isManualMode ? 'manual' : 'auto'}`}>
              <div className="mode-dot"></div>
              <span>{isManualMode ? 'MANUAL MODE' : 'AUTO MODE'}</span>
            </div>

            <div className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
              <div className="status-pulse"></div>
              <div className="status-text">
                <span className="status-label">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                <span className="status-time">{formatTimeAgo(lastUpdate)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="system-indicators">
          <div className={`indicator ${gasDetected ? 'critical' : 'safe'}`}>
            <div className="indicator-light"></div>
            <span>Gas Detection</span>
          </div>
          <div className={`indicator ${fanWarning ? 'warning' : 'safe'}`}>
            <div className="indicator-light"></div>
            <span>Fan Status</span>
          </div>
          <div className={`indicator ${pumpWarning ? 'warning' : 'safe'}`}>
            <div className="indicator-light"></div>
            <span>Pump Status</span>
          </div>
          <div className={`indicator ${isOnline ? 'safe' : 'critical'}`}>
            <div className="indicator-light"></div>
            <span>System Connection</span>
          </div>
        </div>
      </header>

      <main className="grid">
        <section className="left-main">
          <div className="sensor-section card">
            <h2 className="section-title">Live Sensor Data</h2>
            <div className="sensor-grid">
              <div className="sensor-card">
                <div className="sensor-icon">🌡️</div>
                <div className="sensor-data">
                  <div className="sensor-label">Temperature</div>
                  <div className="sensor-value">{sensors.temp===null?"—":`${sensors.temp}°C`}</div>
                  <div className="sensor-info">Auto fan &gt; {FAN_THRESHOLD}°C</div>
                </div>
              </div>

              <div className="sensor-card">
                <div className="sensor-icon">💧</div>
                <div className="sensor-data">
                  <div className="sensor-label">Humidity</div>
                  <div className="sensor-value">{sensors.hum===null?"—":`${sensors.hum}%`}</div>
                  <div className="sensor-info">Environment stability</div>
                </div>
              </div>

              <div className={`sensor-card ${sensors.mq135 ? 'alert' : ''}`}>
                <div className="sensor-icon">⚠️</div>
                <div className="sensor-data">
                  <div className="sensor-label">MQ135 Air Quality</div>
                  <div className="sensor-value">{sensors.mq135 ? "DETECTED" : "CLEAR"}</div>
                  <div className="sensor-info">Pollutants & CO₂</div>
                </div>
              </div>

              <div className={`sensor-card ${sensors.mq2 ? 'alert' : ''}`}>
                <div className="sensor-icon">🔥</div>
                <div className="sensor-data">
                  <div className="sensor-label">MQ2 Flammable</div>
                  <div className="sensor-value">{sensors.mq2 ? "DETECTED" : "CLEAR"}</div>
                  <div className="sensor-info">LPG, Smoke, Methane</div>
                </div>
              </div>

<div className="sensor-card">
  <div className="sensor-icon">📏</div>
  <div className="sensor-data">
    <div className="sensor-label">Fluid Level</div>

    <div className="sensor-value">
      {sensors.distance === null
        ? "—"
        : `${fluidPercentage}%`}
    </div>

    <div className="sensor-info">
      {sensors.distance === null
        ? "No data"
        : `Level: ${sensors.distance} cm | Auto pump ≥ ${PUMP_ON_LEVEL}cm`}
    </div>
  </div>
</div>

            </div>
          </div>

          <div className="card chart-card">
            <h3 className="chart-title">Temperature Trends (24h)</h3>
            {loadingHistory ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <span>Loading history...</span>
              </div>
            ) : (
              <TemperatureChart data={tempSeries} />
            )}
          </div>

          <div className="analytics-section">
            <div className="analytics-grid">
              <div className="analytic-card">
                <div className="analytic-icon">🌡️</div>
                <div className="analytic-value">{analytics.avgTemp===null?"—":analytics.avgTemp + "°C"}</div>
                <div className="analytic-label">Avg Temp (24h)</div>
              </div>

              <div className="analytic-card">
                <div className="analytic-icon">⚠️</div>
                <div className="analytic-value">{analytics.gasCount}</div>
                <div className="analytic-label">Gas Alerts</div>
              </div>

              <div className="analytic-card">
                <div className="analytic-icon">💧</div>
                <div className="analytic-value">{analytics.pumpOnMinutes}m</div>
                <div className="analytic-label">Pump Runtime</div>
              </div>

              <div className="analytic-card">
                <div className="analytic-icon">🌀</div>
                <div className="analytic-value">{analytics.fanOnMinutes}m</div>
                <div className="analytic-label">Fan Runtime</div>
              </div>
            </div>
          </div>
        </section>

        <aside className="right-col">
          <section className="card controls-card">
            <h2 className="section-title">Manual Controls</h2>
            <div className="control-grid">
              <div className={`control-item ${commands.fan !== null ? 'manual-active' : ''}`}>
                <div className="control-header">
                  <div className="control-info">
                    <h3>Industrial Fan</h3>
                    <p className="control-status">
                      {commands.fan === null ? `Auto (>${FAN_THRESHOLD}°C)` : (commands.fan ? "Manual ON" : "Manual OFF")}
                    </p>
                  </div>
                  <div className={`control-indicator ${effective.fan ? 'running' : 'stopped'}`}>
                    {effective.fan ? 'RUNNING' : 'STOPPED'}
                  </div>
                </div>
                <ToggleSwitch 
                  checked={commands.fan ?? false} 
                  onChange={(v)=>doSendCommand("fan", v)} 
                />
              </div>

              <div className={`control-item ${commands.pump !== null ? 'manual-active' : ''}`}>
                <div className="control-header">
                  <div className="control-info">
                    <h3>Water Pump</h3>
                    <p className="control-status">
                      {commands.pump === null ? `Auto (>${PUMP_ON_LEVEL}cm)` : (commands.pump ? "Manual ON" : "Manual OFF")}
                    </p>
                  </div>
                  <div className={`control-indicator ${effective.pump ? 'running' : 'stopped'}`}>
                    {effective.pump ? 'RUNNING' : 'STOPPED'}
                  </div>
                </div>
                <ToggleSwitch 
                  checked={commands.pump ?? false} 
                  onChange={(v)=>doSendCommand("pump", v)} 
                />
              </div>

              <div className={`control-item ${commands.buzzer !== null ? 'manual-active' : ''} ${gasDetected ? 'alert-active' : ''}`}>
                <div className="control-header">
                  <div className="control-info">
                    <h3>Exhaust + Buzzer</h3>
                    <p className="control-status">
                      {commands.buzzer === null ? "Auto (gas detect)" : (commands.buzzer ? "Manual ON" : "Manual OFF")}
                    </p>
                  </div>
                  <div className={`control-indicator ${effective.buzzer ? 'running' : 'stopped'}`}>
                    {effective.buzzer ? 'ACTIVE' : 'STANDBY'}
                  </div>
                </div>
                <ToggleSwitch 
                  checked={commands.buzzer ?? false} 
                  onChange={(v)=>doSendCommand("buzzer", v)} 
                />
              </div>
            </div>

            <button className="reset-button" onClick={resetToAuto}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
              </svg>
              Reset All to Auto
            </button>
          </section>

          <section className="card status-card">
            <h2 className="section-title">Real-Time Status</h2>
            <div className="status-list">
              <div className="status-row">
                <span className="status-name">Industrial Fan</span>
                <div className={`status-pill ${effective.fan ? 'active' : 'inactive'}`}>
                  <span className="status-dot"></span>
                  {effective.fan ? 'RUNNING' : 'STOPPED'}
                </div>
              </div>
              <div className="status-row">
                <span className="status-name">Water Pump</span>
                <div className={`status-pill ${effective.pump ? 'active' : 'inactive'}`}>
                  <span className="status-dot"></span>
                  {effective.pump ? 'RUNNING' : 'STOPPED'}
                </div>
              </div>
              <div className="status-row">
                <span className="status-name">Exhaust + Buzzer</span>
                <div className={`status-pill ${effective.buzzer ? 'active' : 'inactive'}`}>
                  <span className="status-dot"></span>
                  {effective.buzzer ? 'ACTIVE' : 'STANDBY'}
                </div>
              </div>
            </div>
          </section>

          <section className="card system-info-card">
            <h2 className="section-title">System Info</h2>
            <div className="info-grid">
              <div className="info-item">
                <div className="info-label">Device ID</div>
                <div className="info-value">{DEVICE_ID}</div>
              </div>
              <div className="info-item">
                <div className="info-label">Last Update</div>
                <div className="info-value">
                  {isOnline ? formatTimeAgo(lastUpdate) : "Offline"}
                </div>
              </div>
              <div className="info-item">
                <div className="info-label">Data Points (24h)</div>
                <div className="info-value">{history.length}</div>
              </div>
              <div className="info-item">
                <div className="info-label">Mode</div>
                <div className="info-value">{isManualMode ? "Manual" : "Auto"}</div>
              </div>
            </div>
            
            <div className="thresholds-section">
              <h3 className="thresholds-title">Active Thresholds</h3>
              <div className="threshold-list">
                <div className="threshold-item">
                  <span className="threshold-label">Fan Trigger</span>
                  <span className="threshold-value">&gt; {FAN_THRESHOLD}°C</span>
                </div>
                <div className="threshold-item">
                  <span className="threshold-label">Pump Trigger</span>
                  <span className="threshold-value">&gt; {PUMP_ON_LEVEL}cm</span>
                </div>
                <div className="threshold-item">
                  <span className="threshold-label">Gas Alert</span>
                  <span className="threshold-value">Any Detection</span>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </main>

      <footer className="footer">
        <div className="footer-content">
          <span>Connected Device: <strong>{DEVICE_ID}</strong></span>
          <span className="footer-divider">•</span>
          <span>InduSense v2.0 — Industrial IoT Platform</span>
        </div>
      </footer>
    </div>
  );
}