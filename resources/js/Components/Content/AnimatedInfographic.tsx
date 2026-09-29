import { Link } from '@inertiajs/react'
import { faGlobe, faEarthEurope, faWater, faHotel, faUtensils, IconDefinition } from '@fortawesome/free-solid-svg-icons'

import BlockWrapper from '../Common/BlockWrapper'
import AnimatedCounter from '../Common/AnimatedCounter'
import Icon from '../Common/Icon'

interface InfographicStats {
    continents: number
    countries: number
    spots: number
    hotels: number
    restaurants: number
}

interface AnimatedInfographicProps {
    stats: InfographicStats
}

interface InfographicItem {
    label: string
    value: number
    icon: IconDefinition
}

const AnimatedInfographic = ({ stats }: AnimatedInfographicProps) => {
    if (!stats) return null

    const items: InfographicItem[] = [
        { label: 'Continents', value: stats.continents, icon: faGlobe },
        { label: 'Countries', value: stats.countries, icon: faEarthEurope },
        { label: 'Spots', value: stats.spots, icon: faWater },
        { label: 'Hotels', value: stats.hotels, icon: faHotel },
        { label: 'Restaurants', value: stats.restaurants, icon: faUtensils },
    ]

    const blockWrapperOptions = {
        noContainer: true,
        fill: true,
        bgColourClass: 'bg-gradient-to-b from-primary to-primary-darker',
    }

    const rotations = [
        'after:rotate-0',
        'after:rotate-90',
        'after:rotate-180',
        'after:-rotate-90',
        'after:rotate-0',
    ]

    const colourAccents = [
        'after:to-primary-lighter/20',
        'after:to-primary-lighter/30',
        'after:to-primary-lighter/40',
        'after:to-primary-lighter/30',
        'after:to-primary-lighter/20',
    ]

    return (
        <BlockWrapper options={blockWrapperOptions}>
            <div className="container mx-auto space-y-8 lg:space-y-12">
                <div className="flex items-center justify-between">
                    <div className="uppercase space-y-2">
                        <h2 className="text-3xl text-white lg:text-6xl">
                            Global
                        </h2>
                        <p className="text-xl lg:text-4xl text-primary-lighter">
                            Windsurfing spot guides
                        </p>
                    </div>

                    <div className="prose prose-invert">
                        <Link href="/destinations">
                            View all <span className="sr-only">destinations</span>
                        </Link>
                    </div>
                </div>

                {/* lg+: one row — five 200px circles overflow the container, so they shrink to share it rather than wrap 4 + 1. */}
                <ul className="flex flex-col items-center justify-center sm:flex-row sm:flex-wrap sm:justify-evenly lg:flex-nowrap lg:justify-between gap-8 lg:gap-6 xl:gap-10">
                    {items.map(({ label, value, icon }, index) => {
                        const listClasses = [
                            'relative z-10 max-w-[200px] w-full lg:flex-1 lg:min-w-0 aspect-square rounded-full border-2 flex items-center justify-center overflow-hidden',
                            'shadow-2xl shadow-white/20',
                            'group',
                            'prose prose-invert prose-h3:!mt-0',
                            'after:pointer-events-none after:absolute after:z-10 after:inset-2 after:border after:rounded-full after:from-transparent after:from-50% after:to-90% after:bg-gradient-to-br',
                            rotations[index],
                            colourAccents[index],
                            'after:border-white/40 border-white text-white',
                        ].filter(Boolean).join(' ')

                        return (
                            <li key={label} className={listClasses}>
                                <Icon
                                    icon={icon}
                                    size="40"
                                    customClasses="absolute inset-0 w-full h-full text-white/10 pointer-events-none"
                                />

                                <div className="text-center group-hover:scale-[1.05] transition-transform duration-300">
                                    <AnimatedCounter
                                        from={0}
                                        to={value}
                                        className="text-4xl"
                                    />
                                    {/* Steps down on lg, where the single row shrinks the circles, so "Restaurants" still fits. */}
                                    <h3 className="pt-4 text-primary-lightest text-2xl lg:text-xl xl:text-2xl">
                                        {label}
                                    </h3>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </div>
        </BlockWrapper>
    )
}

export default AnimatedInfographic
