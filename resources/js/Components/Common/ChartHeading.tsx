// resources/js/Components/Common/ChartHeading.tsx
//
// The one heading style for every chart card on the site (destinations
// comparison charts and spot-guide statistics): a display-font title plus a
// small explanatory line. Shared so the cards can't drift apart again; they
// had three different title sizes and two subtitle sizes.

import type { ReactNode } from 'react'

interface Props {
    title: string
    /** One line saying what the chart measures, e.g. "Typical days with 2+ hours at or above 20 kts". */
    subtitle: ReactNode
}

/**
 * Render a chart card's title and subtitle.
 */
const ChartHeading = ({ title, subtitle }: Props) => (
    <div>
        <h3 className="font-display text-secondary tracking-wide" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
            {title}
        </h3>
        <p className="text-secondary/50 text-sm mt-1">{subtitle}</p>
    </div>
)

export default ChartHeading
