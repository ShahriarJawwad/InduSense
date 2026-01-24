// src/components/ToggleSwitch.jsx
import React from "react";
import "./ToggleSwitch.css"; // optional, small local styles if you want

export default function ToggleSwitch({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="slider" />
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}
