// src/components/TemperatureChart.jsx
import React, { useEffect, useRef } from "react";
import { Chart, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, TimeScale, Filler } from "chart.js";
import 'chartjs-adapter-date-fns';

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, TimeScale, Filler);

export default function TemperatureChart({ data }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");

    const chartData = {
      datasets: [{
        label: "Temperature (°C)",
        data: data.map(d => ({ x: d.ts, y: d.temp })),
        tension: 0.4,
        fill: true,
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, 'rgba(0, 217, 255, 0.3)');
          gradient.addColorStop(1, 'rgba(0, 217, 255, 0)');
          return gradient;
        },
        borderColor: '#00d9ff',
        borderWidth: 3,
        pointRadius: 4,
        pointBackgroundColor: '#00d9ff',
        pointBorderColor: '#0a0e1a',
        pointBorderWidth: 2,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#00d9ff',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 3,
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
        interaction: {
          intersect: false,
          mode: 'index',
        },
        scales: {
          x: {
            type: "time",
            time: { 
              unit: "hour", 
              tooltipFormat: "PPpp",
              displayFormats: {
                hour: 'HH:mm'
              }
            },
            ticks: { 
              maxRotation: 0,
              color: '#9aa1b3',
              font: {
                family: 'Rajdhani',
                size: 11,
                weight: '600'
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
              drawBorder: false,
            },
            border: {
              display: false
            }
          },
          y: {
            title: { 
              display: true, 
              text: "Temperature (°C)",
              color: '#9aa1b3',
              font: {
                family: 'Rajdhani',
                size: 12,
                weight: '700'
              }
            },
            ticks: {
              color: '#9aa1b3',
              font: {
                family: 'Orbitron',
                size: 11,
                weight: '600'
              },
              callback: function(value) {
                return value + '°C';
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
              drawBorder: false,
            },
            border: {
              display: false
            },
            beginAtZero: false,
          }
        },
        plugins: {
          legend: { 
            display: false 
          },
          tooltip: {
            backgroundColor: 'rgba(26, 31, 46, 0.95)',
            titleColor: '#00d9ff',
            bodyColor: '#e8eaed',
            borderColor: '#00d9ff',
            borderWidth: 1,
            padding: 12,
            displayColors: false,
            titleFont: {
              family: 'Rajdhani',
              size: 13,
              weight: '700'
            },
            bodyFont: {
              family: 'Orbitron',
              size: 14,
              weight: '600'
            },
            callbacks: {
              label: function(context) {
                return context.parsed.y + '°C';
              }
            }
          }
        }
      }
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [data]);

  return (
    <div style={{ height: 280, width: "100%", position: "relative" }}>
      <canvas ref={canvasRef} />
    </div>
  );
}