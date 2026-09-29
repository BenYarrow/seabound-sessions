// RelatedSpotGuides — closing "explore more" slider for the spot-guide page.
// Shows other guides in the same country (or continent as a fallback) as a
// full-bleed, one-slide-per-view Swiper carousel: a cinematic image with the
// guide's title, intro snippet and spot-overview badges laid over a dark
// gradient. Renders nothing when there are no guides.
// Data shape is produced by SpotGuideController::show (related_spot_guides prop).

import { Link } from '@inertiajs/react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination } from 'swiper/modules'
import { faChevronLeft, faChevronRight, faArrowRight, faWind, faCompass } from '@fortawesome/free-solid-svg-icons'

import CoverImage from '@/Components/Common/CoverImage'
import Icon from '@/Components/Common/Icon'
import AnimateInView from '@/Components/Common/AnimateInView'
import type { FocalImage } from '@/types/media'

import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'

/** One related guide, as shaped by the controller. */
interface RelatedGuide {
    id: number
    title: string
    slug: string
    thumbnail: FocalImage | null
    intro_snippet: string
    overview: {
        wind_conditions: string | null
        best_direction: string | null
    }
}

interface RelatedSpotGuidesProps {
    /** 'country' | 'continent' — which relation produced the set (unused for display; label carries the text). */
    relation: 'country' | 'continent' | null
    /** Human label for the heading, e.g. "Greece" or "Europe". */
    label: string | null
    guides: RelatedGuide[]
}

/**
 * A single overview badge (wind conditions / best direction) shown over the
 * image. Rendered only by the parent when its value is present.
 *
 * @param icon - FontAwesome icon definition to lead the badge.
 * @param children - The badge label text.
 */
const OverviewBadge = ({ icon, children }: { icon: typeof faWind; children: string }) => (
    <span className="inline-flex items-center gap-1.5 bg-white/15 text-white text-[11px] uppercase tracking-wide px-3 py-1 rounded-full backdrop-blur-sm">
        <Icon icon={icon} size="size-3" />
        {children}
    </span>
)

/**
 * Render the related-guides slider. Returns null when there is nothing to show
 * so the section disappears entirely (matches the controller's empty case).
 * Always one slide per view — each slide is a full-bleed image card that links
 * through to that guide.
 *
 * @param props - See {@link RelatedSpotGuidesProps}.
 */
const RelatedSpotGuides = ({ relation, label, guides }: RelatedSpotGuidesProps) => {
    if (!guides || guides.length === 0) return null

    // Clarify the basis of the grouping: a country match is genuinely nearby,
    // whereas a continent fallback can span the whole continent (e.g. South
    // Africa ↔ Egypt), so the eyebrow keeps "More Spots in Africa" honest.
    const relationLabel = relation === 'country' ? 'Same country' : relation === 'continent' ? 'Same continent' : null

    return (
        <section id="related-spot-guides" className="bg-cream">
            <div className="container mx-auto py-14 lg:py-18">
                {/* Heading — matches the page's SectionHeading treatment. */}
                <div className="flex items-start gap-4 mb-8 lg:mb-10">
                    <div className="mt-2 w-1 h-10 bg-orange rounded-full shrink-0" />
                    <div>
                        {relationLabel && (
                            <span className="block text-orange text-[11px] uppercase tracking-[0.35em] font-semibold mb-2">
                                {relationLabel}
                            </span>
                        )}
                        <h2
                            className="font-display leading-none tracking-wide text-secondary"
                            style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
                        >
                            {label ? `More Spots in ${label}` : 'More Spots'}
                        </h2>
                    </div>
                </div>

                <AnimateInView tag="div">
                    <Swiper
                        modules={guides.length > 1 ? [Navigation, Pagination] : []}
                        slidesPerView={1}
                        spaceBetween={0}
                        // Loop so the arrows never dead-end on the last guide. Swiper
                        // needs 3+ slides to loop one-per-view cleanly; with exactly two
                        // it stays linear and the end arrow greys out instead (the
                        // `swiper-button-disabled` styling on the buttons below).
                        loop={guides.length > 2}
                        navigation={{
                            nextEl: '.swiper-related-next',
                            prevEl: '.swiper-related-prev',
                        }}
                        pagination={{
                            el: '.swiper-related-pagination',
                            clickable: true,
                            bulletClass: 'related-bullet',
                            bulletActiveClass: 'related-bullet-active',
                            renderBullet: (_index: number, className: string) =>
                                `<span class="${className}"></span>`,
                        }}
                    >
                        {guides.map((guide) => (
                            <SwiperSlide key={guide.id}>
                                <Link
                                    href={`/destinations/${guide.slug}`}
                                    className="group relative block h-[440px] md:h-[520px] rounded-2xl overflow-hidden bg-primary-darker"
                                >
                                    {guide.thumbnail && (
                                        <CoverImage
                                            image={guide.thumbnail}
                                            alt={guide.title}
                                            className="absolute inset-0 w-full h-full"
                                            imageClassName="group-hover:scale-105 transition-transform duration-700 ease-out"
                                        />
                                    )}

                                    {/* Dark gradient so overlaid text stays legible. */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                    <div className="absolute bottom-0 left-0 right-0 p-7 md:p-12 max-w-3xl">
                                        <h3
                                            className="font-title text-white leading-[0.95] drop-shadow-lg"
                                            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}
                                        >
                                            {guide.title}
                                        </h3>

                                        {guide.intro_snippet && (
                                            <p className="text-white/75 text-sm md:text-base mt-3 line-clamp-2 leading-relaxed max-w-2xl">
                                                {guide.intro_snippet}
                                            </p>
                                        )}

                                        <div className="mt-5 flex flex-wrap items-center gap-2.5">
                                            {guide.overview.wind_conditions && (
                                                <OverviewBadge icon={faWind}>{guide.overview.wind_conditions}</OverviewBadge>
                                            )}
                                            {guide.overview.best_direction && (
                                                <OverviewBadge icon={faCompass}>{guide.overview.best_direction}</OverviewBadge>
                                            )}
                                            <span className="ml-1 inline-flex items-center gap-2 text-white text-sm font-semibold group-hover:gap-3.5 transition-all duration-300">
                                                Explore <Icon icon={faArrowRight} size="size-3.5" />
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            </SwiperSlide>
                        ))}
                    </Swiper>

                    {/* Controls: pagination dots (left) + prev/next arrows (right). Only
                        shown when there is more than one slide — with a single card there
                        is nothing to page to, so chevrons/dots would mislead. They sit
                        outside the slide Links so they never trigger navigation. */}
                    {guides.length > 1 && (
                        <div className="mt-7 flex items-center justify-between">
                            <div className="swiper-related-pagination flex items-center gap-2.5" />
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    aria-label="Previous spot guide"
                                    className="swiper-related-prev w-11 h-11 rounded-full border border-secondary/30 flex items-center justify-center text-secondary hover:bg-secondary hover:text-white transition-colors duration-300 [&.swiper-button-disabled]:opacity-30 [&.swiper-button-disabled]:pointer-events-none"
                                >
                                    <Icon icon={faChevronLeft} size="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Next spot guide"
                                    className="swiper-related-next w-11 h-11 rounded-full border border-secondary/30 flex items-center justify-center text-secondary hover:bg-secondary hover:text-white transition-colors duration-300 [&.swiper-button-disabled]:opacity-30 [&.swiper-button-disabled]:pointer-events-none"
                                >
                                    <Icon icon={faChevronRight} size="size-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </AnimateInView>
            </div>
        </section>
    )
}

export default RelatedSpotGuides
