import React from "react";
import "./SpeedDisplay.css";

const SpeedDisplay: React.FC = () => {
  // Using a three-digit speed of 120 km/h
  const speed = 120;

  return (
    <div className="speed-display">
      <div className="speed">
        <span className="value">{speed}</span>
        <span className="unit">km/h</span>
      </div>
    </div>
  );
};

export default SpeedDisplay;
