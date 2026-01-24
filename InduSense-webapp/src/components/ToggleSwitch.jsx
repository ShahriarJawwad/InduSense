import React from "react";
import "./ToggleSwitch.css";

export default function ToggleSwitch({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="slider"></span>
      {label && <span style={{ marginLeft: "8px" }}>{label}</span>}
    </label>
  );
}
