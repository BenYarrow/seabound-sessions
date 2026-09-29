// resources/js/Components/Map/mapTheme.ts
//
// Shared look for every Mapbox map on the site, so the destinations globe and
// the spot-guide maps read as one family: the light basemap plus a pale
// atmosphere (the default fog is dark space, which fights the light page).

import type { MapEvent } from 'react-map-gl/mapbox'

/** Basemap style used by all site maps. */
export const MAP_STYLE = 'mapbox://styles/mapbox/light-v11'

/**
 * `onLoad` handler that applies the pale fog/atmosphere so a zoomed-out globe
 * reads light, matching the page rather than the dark space the default implies.
 */
export const applyLightAtmosphere = (event: MapEvent) => {
    event.target.setFog({
        color: 'rgb(224, 236, 242)',
        'high-color': 'rgb(205, 224, 236)',
        'space-color': 'rgb(235, 241, 246)',
        'horizon-blend': 0.06,
        'star-intensity': 0,
    })
}
