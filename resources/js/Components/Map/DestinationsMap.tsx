import { useMemo, useRef, useState } from 'react'
import Map, { Marker, Popup, MapRef } from 'react-map-gl/mapbox'
import { faRotateLeft, faWind } from '@fortawesome/free-solid-svg-icons'
import { usePage } from '@inertiajs/react'
import { Link } from '@inertiajs/react'
import Icon from '@/Components/Common/Icon'
import CoverImage from '@/Components/Common/CoverImage'
import ClickToInteract from '@/Components/Map/ClickToInteract'
import { MAP_STYLE, applyLightAtmosphere } from '@/Components/Map/mapTheme'
import type { FocalImage } from '@/types/media'
import 'mapbox-gl/dist/mapbox-gl.css'

interface SpotGuide {
    id: number
    title: string
    slug: string
    latitude: number | null
    longitude: number | null
    country: { name: string; slug: string; continent: string } | null
    /** Focal-bearing image object (or null when no thumbnail). */
    thumbnail: FocalImage | null
}

interface Props {
    spotGuides: SpotGuide[]
}

const INITIAL_VIEW = {
    latitude: 10,
    longitude: 15,
    zoom: 1.2,
}

// Zoom bounds: out to just the whole globe, in to roughly town level — past
// that the wind markers stop being useful and the basemap is mostly empty sea.
const MIN_ZOOM = 1
const MAX_ZOOM = 10

const DestinationsMap = ({ spotGuides }: Props) => {
    const { mapboxToken } = usePage<{ mapboxToken: string }>().props as any
    const mapRef = useRef<MapRef | null>(null)
    const [popupInfo, setPopupInfo] = useState<SpotGuide | null>(null)

    const markers = useMemo(
        () =>
            spotGuides
                .filter((s) => s.latitude && s.longitude)
                .map((spot) => (
                    <Marker
                        key={spot.id}
                        longitude={spot.longitude!}
                        latitude={spot.latitude!}
                        anchor="center"
                        onClick={(e) => {
                            e.originalEvent.stopPropagation()
                            setPopupInfo(spot)
                        }}
                        className="cursor-pointer"
                    >
                        <span className="group relative size-9 rounded-full flex items-center justify-center border border-primary-lighter/60 bg-primary hover:bg-primary-lighter transition-all duration-300 shadow-lg shadow-black/40">
                            <Icon icon={faWind} size="size-4" customClasses="text-white" />
                            <span className="absolute inset-0 rounded-full ring-2 ring-primary-lighter/0 group-hover:ring-primary-lighter/50 transition-all duration-300" />
                        </span>
                    </Marker>
                )),
        [spotGuides]
    )

    const handleReset = () => {
        mapRef.current?.flyTo({
            center: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
            zoom: INITIAL_VIEW.zoom,
            duration: 1200,
        })
        setPopupInfo(null)
    }

    return (
        <ClickToInteract className="destinations-map w-full">
            <Map
                ref={mapRef}
                mapboxAccessToken={mapboxToken}
                initialViewState={INITIAL_VIEW}
                style={{ height: 620 }}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                mapStyle={MAP_STYLE}
                logoPosition="bottom-right"
                attributionControl={false}
                onLoad={applyLightAtmosphere}
            >
                {markers}

                {popupInfo && popupInfo.longitude && popupInfo.latitude && (
                    <Popup
                        longitude={popupInfo.longitude}
                        latitude={popupInfo.latitude}
                        anchor="left"
                        onClose={() => setPopupInfo(null)}
                        closeOnClick={false}
                        offset={16}
                    >
                        <div className="space-y-1">
                            <Link
                                href={`/destinations/${popupInfo.slug}`}
                                className="block font-display text-xl text-white hover:text-primary-lighter transition-colors leading-none tracking-wide"
                            >
                                {popupInfo.title}
                            </Link>
                            {popupInfo.country && (
                                <p className="text-white/45 text-[10px] uppercase tracking-[0.2em]">
                                    {popupInfo.country.name}
                                </p>
                            )}
                        </div>
                        {popupInfo.thumbnail && (
                            <div className="mt-3 -mx-[14px] -mb-[12px] overflow-hidden">
                                <Link href={`/destinations/${popupInfo.slug}`}>
                                    <CoverImage
                                        image={popupInfo.thumbnail}
                                        alt={popupInfo.title}
                                        className="w-full h-24"
                                        imageClassName="hover:scale-105 transition-transform duration-500"
                                        showCredit={false}
                                    />
                                </Link>
                            </div>
                        )}
                    </Popup>
                )}

                {/* Reset button */}
                <button
                    className="absolute left-4 bottom-4 flex items-center gap-2 bg-secondary/90 backdrop-blur-sm border border-white/10 text-white text-xs uppercase tracking-wide px-3 py-2 hover:bg-primary transition-colors duration-300"
                    onClick={handleReset}
                >
                    <Icon icon={faRotateLeft} size="size-3.5" />
                    <span>Reset view</span>
                </button>
            </Map>
        </ClickToInteract>
    )
}

export default DestinationsMap
