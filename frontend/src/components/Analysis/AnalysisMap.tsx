import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, Marker } from '@react-google-maps/api';
import type { AnalysisPoint } from '../../utils/analysis';
import type { Corner } from '../../types';
import type { CornerRange } from './AnalysisChartWrapper';

interface AnalysisMapProps {
    data: AnalysisPoint[];
    zoomedData?: AnalysisPoint[];
    activePoint?: AnalysisPoint | null;
    corners?: Corner[];
    cornerRanges?: CornerRange[];
    onCornerSelect?: (id: number) => void;
}

const mapContainerStyle = {
    width: '100%',
    height: '100%',
    borderRadius: '0.75rem',
    backgroundColor: '#18181b',
};

// REF = orange, ANA = blue (same as base paths & charts)
const REF_COLOR = '#f97316';
const ANA_COLOR = '#3b82f6';

// Dark Mode Style for Google Maps
const darkMapInstanceStyles: google.maps.MapTypeStyle[] = [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    {
        featureType: "administrative.locality",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
    },
    {
        featureType: "poi",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
    },
    {
        featureType: "poi.park",
        elementType: "geometry",
        stylers: [{ color: "#263c3f" }],
    },
    {
        featureType: "poi.park",
        elementType: "labels.text.fill",
        stylers: [{ color: "#6b9a76" }],
    },
    {
        featureType: "road",
        elementType: "geometry",
        stylers: [{ color: "#38414e" }],
    },
    {
        featureType: "road",
        elementType: "geometry.stroke",
        stylers: [{ color: "#212a37" }],
    },
    {
        featureType: "road",
        elementType: "labels.text.fill",
        stylers: [{ color: "#9ca5b3" }],
    },
    {
        featureType: "road.highway",
        elementType: "geometry",
        stylers: [{ color: "#746855" }],
    },
    {
        featureType: "road.highway",
        elementType: "geometry.stroke",
        stylers: [{ color: "#1f2835" }],
    },
    {
        featureType: "road.highway",
        elementType: "labels.text.fill",
        stylers: [{ color: "#f3d19c" }],
    },
    {
        featureType: "transit",
        elementType: "geometry",
        stylers: [{ color: "#2f3948" }],
    },
    {
        featureType: "transit.station",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
    },
    {
        featureType: "water",
        elementType: "geometry",
        stylers: [{ color: "#17263c" }],
    },
    {
        featureType: "water",
        elementType: "labels.text.fill",
        stylers: [{ color: "#515c6d" }],
    },
    {
        featureType: "water",
        elementType: "labels.text.stroke",
        stylers: [{ color: "#17263c" }],
    },
    {
        featureType: "poi",
        stylers: [{ visibility: "off" }]
    }
];

const AnalysisMap: React.FC<AnalysisMapProps> = ({ data, zoomedData, activePoint, corners, cornerRanges, onCornerSelect }) => {
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
    });

    const mapRef = useRef<google.maps.Map | null>(null);

    const onLoad = useCallback((map: google.maps.Map) => {
        mapRef.current = map;
        // Initial fit bounds
        if (data.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            data.forEach(p => bounds.extend({ lat: p.lat, lng: p.lon }));
            map.fitBounds(bounds);
        }
    }, [data]);

    const onUnmount = useCallback(() => {
        mapRef.current = null;
    }, []);

    // Update bounds when zoomedData changes
    useEffect(() => {
        if (!mapRef.current || !zoomedData || zoomedData.length === 0) return;

        const bounds = new google.maps.LatLngBounds();
        const lats = zoomedData.map(p => p.lat);
        const lons = zoomedData.map(p => p.lon);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);

        bounds.extend({ lat: minLat, lng: minLon });
        bounds.extend({ lat: maxLat, lng: maxLon });

        mapRef.current.fitBounds(bounds, 20);
    }, [zoomedData]);

    // Build corner polyline segments — REF (orange) paths
    const refCornerSegments = useMemo(() => {
        if (!cornerRanges || cornerRanges.length === 0 || data.length === 0) return [];

        const segments: { path: { lat: number; lng: number }[]; id: number }[] = [];

        for (const cr of cornerRanges) {
            const path: { lat: number; lng: number }[] = [];
            for (const p of data) {
                if (p.distance >= cr.startDist && p.distance <= cr.endDist) {
                    path.push({ lat: p.refLat, lng: p.refLon });
                }
            }
            if (path.length > 1) {
                segments.push({ path, id: cr.id });
            }
        }

        return segments;
    }, [cornerRanges, data]);

    // Build corner polyline segments — ANA (blue) paths
    const anaCornerSegments = useMemo(() => {
        if (!cornerRanges || cornerRanges.length === 0 || data.length === 0) return [];

        const segments: { path: { lat: number; lng: number }[]; id: number }[] = [];

        for (const cr of cornerRanges) {
            const path: { lat: number; lng: number }[] = [];
            for (const p of data) {
                if (p.distance >= cr.startDist && p.distance <= cr.endDist) {
                    path.push({ lat: p.lat, lng: p.lon });
                }
            }
            if (path.length > 1) {
                segments.push({ path, id: cr.id });
            }
        }

        return segments;
    }, [cornerRanges, data]);

    const cornerMarkers = useMemo(() => {
        if (!corners) return [];
        return corners.map(c => {
            const apexPoint = data.reduce((prev, curr) =>
                Math.abs(curr.refTime - c.apex_time) < Math.abs(prev.refTime - c.apex_time) ? curr : prev
                , data[0]);

            if (!apexPoint) return null;

            const label = c.name
                ? `${c.name}${c.direction ? ` ${c.direction}` : ''}`
                : `C${c.id}`;

            return {
                id: c.id,
                label,
                direction: c.direction,
                position: { lat: apexPoint.lat, lng: apexPoint.lon }
            };
        }).filter(Boolean) as { id: number, label: string, direction?: string, position: { lat: number, lng: number } }[];
    }, [corners, data]);


    if (loadError) {
        return <div className="text-red-500 flex items-center justify-center h-full">Error loading Google Maps</div>;
    }

    if (!isLoaded) {
        return <div className="text-zinc-500 flex items-center justify-center h-full">Loading Map...</div>;
    }

    if (!data.length) return <div className="text-zinc-500 flex items-center justify-center h-full">No Map Data</div>;

    const hasCornerSegments = refCornerSegments.length > 0;

    return (
        <div className="w-full h-full rounded-xl overflow-hidden relative z-0 isolated bg-zinc-900 border border-zinc-800">
            <style>{`.gm-err-container, .dismissButton, .gm-err-autocomplete { display: none !important; } .gm-style > div:last-child > div:last-child { display: none !important; }`}</style>
            <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={data.length > 0 ? { lat: data[0].lat, lng: data[0].lon } : undefined}
                zoom={14}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={{
                    styles: darkMapInstanceStyles,
                    disableDefaultUI: true,
                    zoomControl: true,
                    streetViewControl: false,
                    mapTypeControl: true,
                    fullscreenControl: true,
                }}
            >
                {/* Base paths — thin & dim when corner segments exist */}
                <Polyline
                    path={data.map(p => ({ lat: p.refLat, lng: p.refLon }))}
                    options={{
                        strokeColor: '#f97316',
                        strokeOpacity: hasCornerSegments ? 0.3 : 0.8,
                        strokeWeight: hasCornerSegments ? 1 : 2,
                        clickable: false,
                        zIndex: 1
                    }}
                />
                <Polyline
                    path={data.map(p => ({ lat: p.lat, lng: p.lon }))}
                    options={{
                        strokeColor: '#3b82f6',
                        strokeOpacity: hasCornerSegments ? 0.3 : 0.8,
                        strokeWeight: hasCornerSegments ? 1 : 2,
                        clickable: false,
                        zIndex: 2
                    }}
                />

                {/* REF corner segments (orange) */}
                {refCornerSegments.map((seg) => (
                    <Polyline
                        key={`ref-corner-${seg.id}`}
                        path={seg.path}
                        options={{
                            strokeColor: REF_COLOR,
                            strokeOpacity: 0.9,
                            strokeWeight: 4,
                            clickable: false,
                            zIndex: 3
                        }}
                    />
                ))}

                {/* ANA corner segments (blue) */}
                {anaCornerSegments.map((seg) => (
                    <Polyline
                        key={`ana-corner-${seg.id}`}
                        path={seg.path}
                        options={{
                            strokeColor: ANA_COLOR,
                            strokeOpacity: 0.9,
                            strokeWeight: 4,
                            clickable: false,
                            zIndex: 4
                        }}
                    />
                ))}

                {cornerMarkers.map((c) => (
                    <Marker
                        key={`corner-${c.id}`}
                        position={c.position}
                        label={{
                            text: c.label,
                            color: 'white',
                            fontSize: '11px',
                            fontWeight: 'bold',
                        }}
                        icon={{
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: c.label.length > 4 ? 16 : 10,
                            fillColor: c.direction === 'L' ? '#3b82f6' : c.direction === 'R' ? '#ef4444' : '#10b981',
                            fillOpacity: 0.9,
                            strokeColor: 'white',
                            strokeWeight: 2,
                            labelOrigin: new google.maps.Point(0, 0),
                        }}
                        onClick={() => onCornerSelect?.(c.id)}
                    />
                ))}

                {activePoint && (
                    <>
                        <Marker
                            position={{ lat: activePoint.refLat, lng: activePoint.refLon }}
                            zIndex={90}
                            icon={{
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 6,
                                fillColor: '#f97316',
                                fillOpacity: 0.8,
                                strokeColor: 'white',
                                strokeWeight: 2,
                            }}
                        />
                        <Marker
                            position={{ lat: activePoint.lat, lng: activePoint.lon }}
                            zIndex={100}
                            icon={{
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 6,
                                fillColor: '#3b82f6',
                                fillOpacity: 1,
                                strokeColor: 'white',
                                strokeWeight: 2,
                            }}
                        />
                    </>
                )}
            </GoogleMap>


        </div>
    );
};

export default AnalysisMap;
