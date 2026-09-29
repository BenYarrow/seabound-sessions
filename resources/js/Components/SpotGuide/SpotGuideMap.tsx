import { useRef, useState } from 'react'
import Map, { Marker, Popup, MapRef } from 'react-map-gl/mapbox'
import { faWind, faHotel, faUtensils, faRotateLeft } from '@fortawesome/free-solid-svg-icons'
import { usePage } from '@inertiajs/react'
import Icon from '@/Components/Common/Icon'
import CoverImage from '@/Components/Common/CoverImage'
import ClickToInteract from '@/Components/Map/ClickToInteract'
import { MAP_STYLE, applyLightAtmosphere } from '@/Components/Map/mapTheme'
import type { FocalImage } from '@/types/media'
import 'mapbox-gl/dist/mapbox-gl.css'

export interface MapLocation {
    id: number
    name: string
    description?: string
    latitude: number | null
    longitude: number | null
    /** Focal-bearing image object (or null when no thumbnail). */
    thumbnail?: FocalImage | null
    url?: string
    type: 'stay' | 'eat' | 'windsurf'
}

interface Props {
    latitude: number
    longitude: number
    locations: MapLocation[]
}

const TYPE_CONFIG: Record<string, { icon: any; bg: string; label: string }> = {
    windsurf: { icon: faWind, bg: 'bg-primary', label: 'Windsurfing Spots' },
    stay: { icon: faHotel, bg: 'bg-orange', label: 'Where to Stay' },
    eat: { icon: faUtensils, bg: 'bg-primary-lighter', label: 'Where to Eat' },
}

const SpotGuideMap = ({ latitude, longitude, locations }: Props) => {
    const { mapboxToken } = usePage<{ mapboxToken: string }>().props as any
    const mapRef = useRef<MapRef | null>(null)
    const [popupInfo, setPopupInfo] = useState<MapLocation | null>(null)

    const initialView = { latitude, longitude, zoom: 11 }

    const handleReset = () => {
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 11, duration: 1200 })
        setPopupInfo(null)
    }

    const validLocations = locations.filter((l) => l.latitude && l.longitude)
    if (validLocations.length === 0) return null

    return (
        <ClickToInteract className="destinations-map w-full">
            <Map
                ref={mapRef}
                mapboxAccessToken={mapboxToken}
                initialViewState={initialView}
                style={{ height: 500 }}
                mapStyle={MAP_STYLE}
                attributionControl={false}
                onLoad={applyLightAtmosphere}
            >
                {validLocations.map((loc) => {
                    const cfg = TYPE_CONFIG[loc.type]
                    return (
                        <Marker
                            key={`${loc.type}-${loc.id}`}
                            longitude={loc.longitude!}
                            latitude={loc.latitude!}
                            anchor="center"
                            onClick={(e) => {
                                e.originalEvent.stopPropagation()
                                setPopupInfo(loc)
                            }}
                            className="cursor-pointer"
                        >
                            <span className={`size-8 rounded-full flex items-center justify-center border border-white/30 ${cfg.bg} shadow-lg shadow-black/40`}>
                                <Icon icon={cfg.icon} size="size-3.5" customClasses="text-white" />
                            </span>
                        </Marker>
                    )
                })}

                {popupInfo && popupInfo.longitude && popupInfo.latitude && (
                    <Popup
                        longitude={popupInfo.longitude}
                        latitude={popupInfo.latitude}
                        anchor="left"
                        onClose={() => setPopupInfo(null)}
                        closeOnClick={false}
                        offset={14}
                    >
                        <div className="space-y-1">
                            <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">
                                {TYPE_CONFIG[popupInfo.type]?.label}
                            </p>
                            <h4 className="font-display text-lg text-white leading-none tracking-wide">
                                {popupInfo.name}
                            </h4>
                            {popupInfo.description && (
                                <p className="text-white/50 text-xs leading-relaxed mt-1 line-clamp-2">{popupInfo.description}</p>
                            )}
                        </div>
                        {popupInfo.thumbnail && (
                            <div className="mt-2 -mx-[14px] -mb-[12px] overflow-hidden">
                                <CoverImage image={popupInfo.thumbnail} alt={popupInfo.name} className="w-full h-20" showCredit={false} />
                            </div>
                        )}
                    </Popup>
                )}

                {/* Legend */}
                <div className="absolute top-4 left-4 bg-secondary/90 backdrop-blur-sm border border-white/10 p-3 space-y-2">
                    {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
                        <div key={type} className="flex items-center gap-2">
                            <span className={`size-5 rounded-full flex items-center justify-center ${cfg.bg}`}>
                                <Icon icon={cfg.icon} size="size-2.5" customClasses="text-white" />
                            </span>
                            <span className="text-white/60 text-[10px] uppercase tracking-wider">{cfg.label}</span>
                        </div>
                    ))}
                </div>

                <button
                    className="absolute right-4 bottom-4 flex items-center gap-2 bg-secondary/90 backdrop-blur-sm border border-white/10 text-white text-xs uppercase tracking-wide px-3 py-2 hover:bg-primary transition-colors duration-300"
                    onClick={handleReset}
                >
                    <Icon icon={faRotateLeft} size="size-3.5" />
                    <span>Reset</span>
                </button>
            </Map>
        </ClickToInteract>
    )
}

export default SpotGuideMap
