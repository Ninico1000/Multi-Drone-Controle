import React, { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Home, AlertTriangle, Shield, Locate, Navigation } from 'lucide-react';

// Convert numeric drone color (e.g. 0xff0000) to CSS hex string
const colorToHex = (num) => '#' + (num >>> 0).toString(16).padStart(6, '0');

// --- Custom Leaflet Icons ---

const homeIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
    <path d="M16,2 C8,2 2,8.3 2,16 C2,26 16,42 16,42 S30,26 30,16 C30,8.3 24,2 16,2Z"
          fill="#22c55e" stroke="white" stroke-width="1.5"/>
    <text x="16" y="22" text-anchor="middle" font-size="15" fill="white" font-family="sans-serif">&#8962;</text>
  </svg>`,
  className: '',
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -42],
});

const emergencyIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
    <path d="M16,2 C8,2 2,8.3 2,16 C2,26 16,42 16,42 S30,26 30,16 C30,8.3 24,2 16,2Z"
          fill="#f97316" stroke="white" stroke-width="1.5"/>
    <text x="16" y="22" text-anchor="middle" font-size="18" font-weight="bold" fill="white" font-family="sans-serif">!</text>
  </svg>`,
  className: '',
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -42],
});

const geofenceCenterIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="8" fill="none" stroke="#3b82f6" stroke-width="2" stroke-dasharray="4,2"/>
    <circle cx="10" cy="10" r="3" fill="#3b82f6"/>
  </svg>`,
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const createDroneIcon = (color) => L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="12" fill="${colorToHex(color)}" stroke="white" stroke-width="2"/>
    <text x="14" y="18" text-anchor="middle" font-size="12" fill="white" font-family="sans-serif">&#9992;</text>
  </svg>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// --- Inner map component for events + cursor + flyTo ---
const MapController = ({ onMapClick, activeMode, flyTo, onFlyToDone }) => {
  const map = useMap();

  useEffect(() => {
    map.getContainer().style.cursor = activeMode ? 'crosshair' : '';
  }, [activeMode, map]);

  useEffect(() => {
    if (flyTo) {
      map.flyTo(flyTo, 17, { animate: true, duration: 1.2 });
      onFlyToDone();
    }
  }, [flyTo, map, onFlyToDone]);

  useMapEvents({ click: (e) => onMapClick(e.latlng) });

  return null;
};

// --- Default map center (Munich) ---
const DEFAULT_CENTER = [48.1351, 11.582];

// --- Main Component ---
const GPSMissionPlanner = ({ drones, gpsSettings, onGpsSettingsChange, addLog }) => {
  const [activeMode, setActiveMode] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const [flyTo, setFlyTo] = useState(null);

  const { homePoint, emergencyPoint, geofenceCenter, geofenceRadius } = gpsSettings;

  const initialCenter = homePoint
    ? [homePoint.lat, homePoint.lng]
    : geofenceCenter
    ? [geofenceCenter.lat, geofenceCenter.lng]
    : DEFAULT_CENTER;

  const handleMapClick = useCallback((latlng) => {
    const { lat, lng } = latlng;
    if (activeMode === 'home') {
      const updated = { ...gpsSettings, homePoint: { lat, lng } };
      if (!gpsSettings.geofenceCenter) updated.geofenceCenter = { lat, lng };
      onGpsSettingsChange(updated);
      addLog(`Startplatz gesetzt: ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E`);
      setActiveMode(null);
    } else if (activeMode === 'emergency') {
      onGpsSettingsChange({ ...gpsSettings, emergencyPoint: { lat, lng } });
      addLog(`Notlandeplatz gesetzt: ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E`);
      setActiveMode(null);
    } else if (activeMode === 'geofence') {
      onGpsSettingsChange({ ...gpsSettings, geofenceCenter: { lat, lng } });
      addLog(`Geofence-Zentrum gesetzt: ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E`);
      setActiveMode(null);
    }
  }, [activeMode, gpsSettings, onGpsSettingsChange, addLog]);

  const locateMe = () => {
    if (!navigator.geolocation) {
      addLog('GPS: Browser unterstützt keine Geolocation');
      return;
    }
    addLog('GPS: Suche eigene Position...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setFlyTo([lat, lng]);
        addLog(`GPS: Position gefunden – ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E`);
      },
      (err) => addLog(`GPS Fehler: ${err.message}`)
    );
  };

  const ModeButton = ({ mode, icon, label, activeColor }) => (
    <button
      onClick={() => setActiveMode(activeMode === mode ? null : mode)}
      className={`px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
        activeMode === mode
          ? `${activeColor} text-white ring-2 ring-white ring-opacity-30`
          : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Navigation className="w-5 h-5 text-blue-400" />
        GPS Mission Planner
      </h2>

      {/* Toolbar */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <ModeButton
          mode="home"
          icon={<Home className="w-4 h-4" />}
          label="Start-/Landeplatz"
          activeColor="bg-green-600"
        />
        <ModeButton
          mode="emergency"
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Notlandeplatz"
          activeColor="bg-orange-500"
        />
        <ModeButton
          mode="geofence"
          icon={<Shield className="w-4 h-4" />}
          label="Geofence-Zentrum"
          activeColor="bg-blue-600"
        />

        {/* Geofence radius input */}
        <div className="flex items-center gap-2 bg-gray-700 rounded px-3 py-2">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="text-sm text-gray-300">Max. Reichweite:</span>
          <input
            type="number"
            value={geofenceRadius}
            onChange={(e) =>
              onGpsSettingsChange({
                ...gpsSettings,
                geofenceRadius: Math.max(10, parseInt(e.target.value) || 200),
              })
            }
            className="w-24 bg-gray-600 rounded px-2 py-1 text-sm text-center"
            min="10"
            max="10000"
          />
          <span className="text-sm text-gray-300">m</span>
        </div>

        <button
          onClick={locateMe}
          className="px-3 py-2 rounded text-sm flex items-center gap-2 bg-gray-700 hover:bg-gray-600"
        >
          <Locate className="w-4 h-4" />
          Eigene Position
        </button>

        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
            className="rounded"
          />
          Beschriftungen
        </label>
      </div>

      {/* Instruction bar */}
      {activeMode && (
        <div className="mb-3 px-3 py-2 bg-blue-900 border border-blue-600 rounded text-sm text-blue-200 flex items-center gap-2">
          <Locate className="w-4 h-4 flex-shrink-0" />
          {activeMode === 'home' && 'Klicke auf die Karte um den Start-/Landeplatz zu setzen'}
          {activeMode === 'emergency' && 'Klicke auf die Karte um den Notlandeplatz zu setzen'}
          {activeMode === 'geofence' && 'Klicke auf die Karte um das Geofence-Zentrum zu setzen'}
          <button
            onClick={() => setActiveMode(null)}
            className="ml-auto text-blue-400 hover:text-white text-xs underline"
          >
            Abbrechen
          </button>
        </div>
      )}

      {/* Map */}
      <div className="rounded overflow-hidden border border-gray-700">
        <MapContainer
          center={initialCenter}
          zoom={17}
          style={{ height: '520px', width: '100%' }}
          scrollWheelZoom={true}
        >
          {/* Esri World Imagery – Satellite, no API key required */}
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri &mdash; Esri, DigitalGlobe, GeoEye, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo"
            maxZoom={20}
          />
          {/* Optional: Place name labels overlay */}
          {showLabels && (
            <TileLayer
              url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxZoom={20}
            />
          )}

          <MapController
            onMapClick={handleMapClick}
            activeMode={activeMode}
            flyTo={flyTo}
            onFlyToDone={() => setFlyTo(null)}
          />

          {/* Start-/Landeplatz */}
          {homePoint && (
            <Marker position={[homePoint.lat, homePoint.lng]} icon={homeIcon} />
          )}

          {/* Notlandeplatz */}
          {emergencyPoint && (
            <Marker position={[emergencyPoint.lat, emergencyPoint.lng]} icon={emergencyIcon} />
          )}

          {/* Geofence circle + center marker */}
          {geofenceCenter && (
            <>
              <Circle
                center={[geofenceCenter.lat, geofenceCenter.lng]}
                radius={geofenceRadius}
                pathOptions={{
                  color: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.08,
                  weight: 2,
                  dashArray: '8,5',
                }}
              />
              <Marker
                position={[geofenceCenter.lat, geofenceCenter.lng]}
                icon={geofenceCenterIcon}
              />
            </>
          )}

          {/* Drone GPS positions (shown when lat/lng is available from telemetry) */}
          {drones.map((drone) =>
            drone.lat != null && drone.lng != null ? (
              <Marker
                key={drone.id}
                position={[drone.lat, drone.lng]}
                icon={createDroneIcon(drone.color)}
              />
            ) : null
          )}
        </MapContainer>
      </div>

      {/* Info panel */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="bg-gray-700 rounded p-3">
          <div className="flex items-center gap-2 text-green-400 font-semibold mb-2">
            <Home className="w-4 h-4" />
            Start-/Landeplatz
          </div>
          {homePoint ? (
            <div className="text-gray-300 font-mono text-xs space-y-0.5">
              <div>Lat: {homePoint.lat.toFixed(7)}°</div>
              <div>Lng: {homePoint.lng.toFixed(7)}°</div>
            </div>
          ) : (
            <div className="text-gray-500 italic text-xs">
              Nicht gesetzt – oben "Start-/Landeplatz" wählen
            </div>
          )}
        </div>

        <div className="bg-gray-700 rounded p-3">
          <div className="flex items-center gap-2 text-orange-400 font-semibold mb-2">
            <AlertTriangle className="w-4 h-4" />
            Notlandeplatz
          </div>
          {emergencyPoint ? (
            <div className="text-gray-300 font-mono text-xs space-y-0.5">
              <div>Lat: {emergencyPoint.lat.toFixed(7)}°</div>
              <div>Lng: {emergencyPoint.lng.toFixed(7)}°</div>
            </div>
          ) : (
            <div className="text-gray-500 italic text-xs">
              Nicht gesetzt – oben "Notlandeplatz" wählen
            </div>
          )}
        </div>

        <div className="bg-gray-700 rounded p-3">
          <div className="flex items-center gap-2 text-blue-400 font-semibold mb-2">
            <Shield className="w-4 h-4" />
            Max. Reichweite (Geofence)
          </div>
          {geofenceCenter ? (
            <div className="text-gray-300 font-mono text-xs space-y-0.5">
              <div>Lat: {geofenceCenter.lat.toFixed(7)}°</div>
              <div>Lng: {geofenceCenter.lng.toFixed(7)}°</div>
              <div className="text-blue-300 mt-1 font-sans">&#8960; {geofenceRadius * 2}m &mdash; Radius: {geofenceRadius}m</div>
            </div>
          ) : (
            <div className="text-gray-500 italic text-xs">
              Nicht gesetzt – oben "Geofence-Zentrum" wählen
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GPSMissionPlanner;
