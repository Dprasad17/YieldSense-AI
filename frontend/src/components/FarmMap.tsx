import { useEffect, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { apiRequest } from '../api/client';
import { Skeleton } from './ui';

const icon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

interface Props {
  region: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  height?: number;
}

/** Farm location: the farm's own coordinates, or its region's position from the weather service. */
export function FarmMap({ region, name, latitude, longitude, height = 260 }: Props) {
  const has = latitude != null && longitude != null;
  const [pos, setPos] = useState<{ lat: number; lon: number; label: string } | null>(
    has ? { lat: latitude, lon: longitude, label: `${name} (farm coordinates)` } : null,
  );
  const [error, setError] = useState(false);

  useEffect(() => {
    if (has) return;
    let cancelled = false;
    apiRequest<{ latitude: number; longitude: number; label: string }>('/api/weather/coordinates', {
      query: { region },
    })
      .then(r => !cancelled && setPos({ lat: r.latitude, lon: r.longitude, label: `${region} · ${r.label}` }))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [has, region]);

  if (error)
    return (
      <p style={{ color: 'var(--muted)', margin: 0 }}>
        Map unavailable for {region}. Add coordinates to the farm to show it.
      </p>
    );
  if (!pos) return <Skeleton height={height} />;
  return (
    <div style={{ height, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
      <MapContainer
        center={[pos.lat, pos.lon]}
        zoom={has ? 11 : 5}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[pos.lat, pos.lon]} icon={icon}>
          <Popup>
            <strong>{name}</strong>
            <br />
            {pos.label}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
