import React, { useState, useEffect, useRef } from "react";
import "./SpeedDisplay.css";
import { fetchSpeedLimit, SpeedLimitResult } from "../services/osm";

const SpeedDisplay: React.FC = () => {
  const [speed, setSpeed] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [permissionStatus, setPermissionStatus] = useState<string>("prompt");
  const [speedLimit, setSpeedLimit] = useState<number | null>(null);
  const [speedLimitSource, setSpeedLimitSource] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Wake Lock setup
    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
        console.log("Wake Lock is active");

        document.addEventListener("visibilitychange", async () => {
          if (document.visibilityState === "visible" && wakeLock === null) {
            wakeLock = await navigator.wakeLock.request("screen");
          }
        });
      } catch (err) {
        console.log("Wake Lock request failed:", err);
      }
    };

    requestWakeLock();

    // GPS setup
    const requestLocationPermission = async () => {
      try {
        const permission = await navigator.permissions.query({
          name: "geolocation",
        } as PermissionDescriptor as any);
        setPermissionStatus(permission.state);

        permission.addEventListener("change", () => {
          setPermissionStatus(permission.state);
        });
      } catch (err) {
        setError("Error checking location permission");
      }
    };

    requestLocationPermission();

    let watchId: number;

    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          // Update speed
          if (position.coords.speed !== null) {
            const speedKph = position.coords.speed * 3.6;
            setSpeed(speedKph);
            setError("");
          } else {
            setSpeed(null);
          }

          // Fetch speed limit for current position
          const { latitude, longitude } = position.coords;
          if (abortRef.current) {
            abortRef.current.abort();
          }
          const controller = new AbortController();
          abortRef.current = controller;

          fetchSpeedLimit(latitude, longitude, controller.signal)
            .then((res: SpeedLimitResult) => {
              setSpeedLimit(res.speedLimitKph);
              setSpeedLimitSource(res.source);
            })
            .catch(() => {
              setSpeedLimit(null);
              setSpeedLimitSource(null);
            });
        },
        (err) => {
          setError(getGeolocationErrorMessage(err));
          setSpeed(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    } else {
      setError("Geolocation is not supported by your browser");
    }

    // Cleanup function
    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (wakeLock) {
        wakeLock.release().then(() => {
          wakeLock = null;
          console.log("Wake Lock released");
        });
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  const getGeolocationErrorMessage = (
    error: GeolocationPositionError
  ): string => {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return "Location permission denied";
      case error.POSITION_UNAVAILABLE:
        return "Location information unavailable";
      case error.TIMEOUT:
        return "Location request timed out";
      default:
        return "An unknown error occurred";
    }
  };

  const renderContent = () => {
    if (permissionStatus === "denied") {
      return (
        <div className="error">
          Please enable location access in your browser settings
        </div>
      );
    }

    if (error) {
      return <div className="error">{error}</div>;
    }

    if (speed === null) {
      return <div className="message">Waiting for speed data...</div>;
    }

    return (
      <div className="speed">
        <span className="value">{Math.round(speed)}</span>
        <span className="unit">km/h</span>
        {speedLimit !== null && (
          <div style={{ marginTop: "1rem", fontSize: "1.25rem", opacity: 0.9 }}>
            Speed limit: <strong>{speedLimit}</strong> km/h
            {speedLimitSource ? ` (${speedLimitSource})` : ""}
          </div>
        )}
      </div>
    );
  };

  return <div className="speed-display">{renderContent()}</div>;
};

export default SpeedDisplay;
