import React, { useMemo, useRef, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Polyline } from '@react-google-maps/api';
import type { SessionData } from '../types';

interface MapProps {
    data: SessionData;
}

const mapContainerStyle = {
    width: '100%',
    height: '100%',
    borderRadius: '0.75rem',
    backgroundColor: '#242424', // match existing Overview style
};

// Shared Dark Mode Style (Duplicated for now to avoid breaking changes in other files)
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

const MapComponent: React.FC<MapProps> = ({ data }) => {
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
    });

    const mapRef = useRef<google.maps.Map | null>(null);

    const positions = useMemo(() => {
        return data.dataPoints
            .filter(p => !isNaN(p.latitude) && !isNaN(p.longitude) && p.latitude !== 0 && p.longitude !== 0)
            .map(p => ({ lat: p.latitude, lng: p.longitude }));
    }, [data]);

    const onLoad = useCallback((map: google.maps.Map) => {
        mapRef.current = map;
        if (positions.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            // Extend bounds for all points? might be slow for full session. 
            // Optimize: simple bbox
            const lats = positions.map(p => p.lat);
            const lngs = positions.map(p => p.lng);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs);
            const maxLng = Math.max(...lngs);

            bounds.extend({ lat: minLat, lng: minLng });
            bounds.extend({ lat: maxLat, lng: maxLng });
            map.fitBounds(bounds);
        }
    }, [positions]);

    const onUnmount = useCallback(() => {
        mapRef.current = null;
    }, []);

    if (loadError) return <div className="text-red-500">Error loading map</div>;
    if (!isLoaded) return <div className="text-zinc-500">Loading Map...</div>;
    if (!positions.length) return <div className="text-zinc-500">No GPS Data Available</div>;

    return (
        <div className="w-full h-full rounded-xl overflow-hidden relative z-0 isolated">
            <style>{`.gm-err-container, .dismissButton, .gm-err-autocomplete { display: none !important; } .gm-style > div:last-child > div:last-child { display: none !important; }`}</style>
            <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={positions[0]}
                zoom={14}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={{
                    styles: darkMapInstanceStyles,
                    disableDefaultUI: true,
                    zoomControl: false, // Simple overview
                }}
            >
                <Polyline
                    path={positions}
                    options={{
                        strokeColor: '#ef4444',
                        strokeOpacity: 0.8,
                        strokeWeight: 4,
                        clickable: false
                    }}
                />
            </GoogleMap>
        </div>
    );
};

export default MapComponent;
