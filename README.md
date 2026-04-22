# InduSense – Smart Industrial Environment Monitoring & Control System

InduSense is an IoT-based industrial monitoring and control system designed to track environmental parameters in real time and automate device control using cloud connectivity and adaptive logic.

The system integrates embedded hardware (ESP32 and sensors), a cloud backend (Firebase), and a web-based dashboard (React) to provide a complete end-to-end solution for industrial environments.

---

## Overview

The project monitors key environmental conditions such as temperature, humidity, gas presence, and fluid level. Based on these inputs, it can automatically control actuators like fans, pumps, and alarms. It also allows manual control through a web interface.

A key feature of the system is its adaptive behavior, where control thresholds (such as temperature limits) are dynamically adjusted based on historical data.

---

## Features

* Real-time sensor monitoring
* Remote control of industrial devices
* Automatic control logic (fan, pump, alarm)
* Manual override through web dashboard
* Historical data logging and visualization
* Adaptive thresholding based on recent data trends
* Online/offline system status tracking

---

## System Architecture

The system consists of three main layers:

### 1. Embedded Layer

* ESP32 microcontroller
* Sensors:

  * DHT22 (temperature and humidity)
  * MQ135 (air quality)
  * MQ2 (gas detection)
  * HC-SR04 (fluid level)
* Relay module for actuator control

### 2. Cloud Layer

* Firebase Realtime Database
* Stores:

  * Live sensor data
  * Historical data
  * Control commands
  * ML-based thresholds

### 3. Application Layer

* React-based web dashboard
* Real-time data visualization
* Device control interface
* Basic analytics and status indicators

---

## Data Flow

1. ESP32 reads sensor data at regular intervals
2. Data is sent to Firebase (`sensors/latest` and `sensors/history`)
3. Web app listens for updates and displays data in real time
4. User actions update Firebase (`commands/device1`)
5. ESP32 reads commands and controls relays accordingly
6. System state is updated back to Firebase

---

## Machine Learning (Adaptive Logic)

Instead of using a fixed temperature threshold, the system calculates a dynamic threshold based on recent data.

Example logic:

* Threshold = Average temperature (last 24 hours) + offset

This allows the system to automatically adapt to seasonal and environmental changes without manual reconfiguration.

---

## Project Structure

```
src/
 ├── components/
 │    ├── TemperatureChart.jsx
 │    ├── ToggleSwitch.jsx
 │
 ├── App.jsx
 ├── firebase.js
 ├── App.css
 ├── index.css
 └── main.jsx
```

---

## Setup Instructions

### Prerequisites

* Node.js (v16 or higher)
* npm

### Installation

```bash
npm install
```

### Run locally

```bash
npm run dev
```

---

## Firebase Configuration

Create a Firebase project and enable Realtime Database.

Update `firebase.js` with your project credentials:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
};
```

---

## Control Logic

### Automatic Mode

* Fan turns ON when temperature exceeds threshold
* Pump activates based on fluid level
* Alarm triggers when gas is detected

### Manual Mode

* User can override any actuator from the dashboard
* Commands are sent via Firebase and executed by ESP32

---

## Known Issues

* Power instability when driving high-current loads (pump/motor) can reset the ESP32
* Requires proper grounding and separate power supply for relays

---

## Future Improvements

* Mobile app support
* Advanced machine learning models
* Weather-aware control using external APIs
* Predictive maintenance analytics

---

## License

This project is intended for academic and educational use.
