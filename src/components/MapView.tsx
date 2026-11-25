import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  address: string;
  conflict?: boolean;
}

export function DayMap({ points }: { points: MapPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const [tileError, setTileError] = useState(false);
  const key = points.map((point) => `${point.id}:${point.lat}:${point.conflict ? 1 : 0}`).join('|');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const current = pointsRef.current;
    const map = L.map(el, { scrollWheelZoom: false });
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    });
    const onTileError = () => setTileError(true);
    tiles.on('tileerror', onTileError);
    tiles.addTo(map);

    const markers = current.map((point, index) => {
      const icon = L.divIcon({
        className: 'pin-wrap',
        html: `<span class="pin${point.conflict ? ' pin-bad' : ''}">${index + 1}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      return L.marker([point.lat, point.lng], { icon }).bindPopup(
        `<strong>${escapeHtml(point.title)}</strong><br>${escapeHtml(point.address)}`,
      );
    });
    const group = L.featureGroup(markers).addTo(map);
    if (current.length > 1) {
      L.polyline(
        current.map((point) => [point.lat, point.lng] as [number, number]),
        { color: '#1f4d3c', weight: 3, opacity: 0.85 },
      ).addTo(map);
      map.fitBounds(group.getBounds().pad(0.25));
    } else if (current.length === 1) {
      map.setView([current[0].lat, current[0].lng], 14);
    } else {
      map.setView([40.73, -73.98], 12);
    }
    const timer = window.setTimeout(() => map.invalidateSize(), 180);
    return () => {
      window.clearTimeout(timer);
      tiles.off('tileerror', onTileError);
      map.remove();
    };
  }, [key]);

  return (
    <div className="map-frame">
      <div ref={ref} className="map-canvas" role="img" aria-label="Map of today’s stops" />
      {tileError ? (
        <p className="map-fallback">Map tiles didn’t load. The stops and travel estimates below still work offline.</p>
      ) : null}
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[char] ?? char;
  });
}
