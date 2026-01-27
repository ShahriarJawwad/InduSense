// src/components/ToggleSwitch.jsx
import React from "react";
import "./ToggleSwitch.css";

export default function ToggleSwitch({ checked = false, onChange }) {
  return (
    <label className="toggle-switch">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange && onChange(e.target.checked)}
      />
      <div className="toggle-track">
        <div className="toggle-thumb">
          <span className="toggle-icon">
            {checked ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            )}
          </span>
        </div>
        <span className="toggle-label-on">ON</span>
        <span className="toggle-label-off">OFF</span>
      </div>
    </label>
  );
}