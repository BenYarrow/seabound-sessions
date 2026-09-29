import { useState, useEffect } from 'react'
import { Link } from '@inertiajs/react'
import { usePage } from '@inertiajs/react'
import { faBars, faSearch, faXmark } from '@fortawesome/free-solid-svg-icons'
import Icon from './Icon'
import SearchPanel from './SearchPanel'

const navItems = [
    { title: 'Home', href: '/' },
    { title: 'About', href: '/about' },
    { title: 'Destinations', href: '/destinations' },
    { title: 'Blog', href: '/blog' },
    { title: 'Contact', href: '/contact' },
]

// Scales down on narrow screens: the wordmark is `whitespace-nowrap`, so at
// text-2xl it overruns the search/menu buttons on a 375px viewport.
const wordmarkClasses = 'text-white text-base sm:text-xl md:text-2xl uppercase font-title whitespace-nowrap'

const NavBar = () => {
    const { url } = usePage()
    const [showMobileNav, setShowMobileNav] = useState(false)
    const [showSearch, setShowSearch] = useState(false)
    const [scrolled, setScrolled] = useState(false)

    const isHomepage = url === '/'

    useEffect(() => {
        setScrolled(false)
        setShowMobileNav(false)
        setShowSearch(false)

        if (!isHomepage) return

        const handleScroll = () => setScrolled(window.scrollY > 64)
        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [url, isHomepage])

    const isTransparent = isHomepage && !scrolled && !showMobileNav

    const wrapperClasses = [
        'z-[1000] transition-all duration-500',
        isHomepage ? 'fixed top-0 left-0 right-0 w-full' : 'relative',
        isTransparent ? 'bg-transparent' : 'bg-primary shadow-md',
        !isTransparent ? 'border-b border-white/10' : '',
    ].filter(Boolean).join(' ')

    return (
        <div className={wrapperClasses}>
            <SearchPanel open={showSearch} onClose={() => setShowSearch(false)} transparent={isTransparent} />

            {/* Mobile backdrop — dims the page behind the open menu; click to close. */}
            {showMobileNav && (
                <div
                    className="lg:hidden fixed inset-x-0 bottom-0 top-[5rem] bg-black/40 z-0"
                    onClick={() => setShowMobileNav(false)}
                    aria-hidden="true"
                />
            )}

            <header className="h-[5rem] flex items-center">
                <div className="container mx-auto w-full flex items-center justify-between gap-x-6">
                    <div className="flex items-center gap-x-2">
                        <img src="/images/logo-mark.png" alt="Seabound Sessions" className="size-[44px] md:size-[60px]" loading="lazy" />
                        {url === '/' ? (
                            <h1 className={wordmarkClasses}>Seabound Sessions</h1>
                        ) : (
                            <Link href="/" className={wordmarkClasses}>Seabound Sessions</Link>
                        )}
                    </div>

                    <nav className={[
                        'max-lg:absolute max-lg:top-[5rem] max-lg:left-0 max-lg:w-full max-lg:bg-primary max-lg:container max-lg:mx-auto max-lg:z-10',
                        'max-lg:transition-all max-lg:duration-300 max-lg:ease-out',
                        showMobileNav
                            ? 'max-lg:translate-y-0 max-lg:opacity-100'
                            : 'max-lg:-translate-y-3 max-lg:opacity-0 max-lg:pointer-events-none',
                    ].join(' ')}>
                        <ul className="max-lg:pt-6 max-lg:pb-8 flex flex-col lg:flex-row gap-y-3 lg:gap-x-6">
                            {navItems.map(({ href, title }, index) => (
                                <li
                                    key={title}
                                    className={[
                                        'transition-all duration-300 ease-out',
                                        'max-lg:opacity-0 max-lg:translate-y-3',
                                        showMobileNav ? 'max-lg:opacity-100 max-lg:translate-y-0' : '',
                                    ].join(' ')}
                                    // Stagger only matters on mobile (menu open); harmless on desktop
                                    // where the li has no opacity/transform change to delay.
                                    style={{ transitionDelay: showMobileNav ? `${index * 60}ms` : '0ms' }}
                                >
                                    <Link
                                        href={href}
                                        className={[
                                            'text-base lg:text-sm uppercase tracking-wide font-medium whitespace-nowrap transition-opacity duration-200',
                                            url === href ? 'text-white opacity-100' : 'text-white/70 hover:text-white hover:opacity-100',
                                        ].join(' ')}
                                        onClick={() => setShowMobileNav(false)}
                                    >
                                        {title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <div className="flex items-center gap-x-5">
                        <button
                            onClick={() => setShowSearch(prev => !prev)}
                            aria-label="Search"
                            className={[
                                'text-white/70 hover:text-white transition-colors duration-200',
                                showMobileNav ? 'hidden' : 'block',
                            ].join(' ')}
                        >
                            <Icon icon={showSearch ? faXmark : faSearch} size="size-5" />
                        </button>

                        <button
                            onClick={() => { setShowMobileNav(!showMobileNav); setShowSearch(false) }}
                            className="lg:hidden text-white/70 hover:text-white transition-colors duration-200"
                            aria-label="Navigation menu"
                        >
                            <Icon icon={showMobileNav ? faXmark : faBars} size="size-5" />
                        </button>
                    </div>
                </div>
            </header>
        </div>
    )
}

export default NavBar
