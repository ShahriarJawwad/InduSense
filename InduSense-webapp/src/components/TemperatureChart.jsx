// src/components/TemperatureChart.jsx
import React, { useEffect, useRef } from "react";
import { Chart, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, TimeScale } from "chart.js";
import 'chartjs-adapter-date-fns';

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, TimeScale);

export default function TemperatureChart({ data /* array of {ts, temp} */ }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");

    const chartData = {
      datasets: [{
        label: "Temperature (°C)",
        data: data.map(d => ({ x: d.ts, y: d.temp })),
        tension: 0.25,
        fill: false,
        pointRadius: 2,
        borderWidth: 2,
      }]
    };

    if (chartRef.current) {
      chartRef.current.data = chartData;
      chartRef.current.update();
      return;
    }

    chartRef.current = new Chart(ctx, {
      type: "line",
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "time",
            time: { unit: "hour", tooltipFormat: "PPpp" },
            ticks: { maxRotation: 0 },
          },
          y: {
            title: { display: true, text: "°C" },
            beginAtZero: false,
          }
        },
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Temperature — last 24 hours" }
        }
      }
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [data]);

  return (
    <div style={{ height: 300, width: "100%" }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
