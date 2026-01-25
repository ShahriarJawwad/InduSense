// src/components/ToggleSwitch.jsx
import React from "react";
import "./ToggleSwitch.css";

export default function ToggleSwitch({ checked = false, onChange, label }) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange && onChange(e.target.checked)}
      />
      <span className="slider" />
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}
