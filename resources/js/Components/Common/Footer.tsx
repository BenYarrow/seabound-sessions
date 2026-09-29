import { Link } from '@inertiajs/react'
import { faInstagram, faYoutube } from '@fortawesome/free-brands-svg-icons'
import Icon from './Icon'

const navLinks = [
    { title: 'Home', href: '/' },
    { title: 'About', href: '/about' },
    { title: 'Destinations', href: '/destinations' },
    { title: 'Blog', href: '/blog' },
    { title: 'Contact', href: '/contact' },
]

const socialMedia = [
    { icon: faYoutube, link: 'https://www.youtube.com/@seabound_souls', label: 'YouTube' },
    { icon: faInstagram, link: 'https://www.instagram.com/seaboundsouls/', label: 'Instagram' },
]

const Footer = () => {
    const year = new Date().getFullYear()

    return (
        <footer className="relative bg-secondary overflow-hidden">
            {/* Top accent line */}
            <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

            {/* Ghost background text */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden select-none"
            >
                <span
                    className="font-title text-white/[0.025] uppercase whitespace-nowrap"
                    style={{ fontSize: 'clamp(5rem, 18vw, 18rem)', lineHeight: 1 }}
                >
                    Seabound Sessions
                </span>
            </div>

            {/* Main content */}
            <div className="relative container mx-auto py-16 md:py-20">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">

                    {/* Brand column */}
                    <div className="lg:col-span-2 space-y-5">
                        <Link href="/" className="flex items-center gap-3" aria-label="Homepage">
                            <img src="/images/logo-mark.png" alt="" className="w-14" loading="lazy" />
                            <span className="font-title text-white text-2xl uppercase">Seabound Sessions</span>
                        </Link>
                        <p className="text-white/45 text-sm leading-relaxed max-w-xs">
                            Discover the world's finest windsurfing destinations — curated guides,
                            local knowledge and everything you need for your next adventure.
                        </p>
                        <div className="flex gap-4 pt-1">
                            {socialMedia.map((social) => (
                                <a
                                    key={social.label}
                                    href={social.link}
                                    target="_blank"
                                    rel="nofollow external noopener noreferrer"
                                    aria-label={social.label}
                                    className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/50 hover:text-white hover:border-primary-lighter transition-all duration-300"
                                >
                                    <Icon icon={social.icon} size="size-4" />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Explore links */}
                    <div>
                        <h4 className="text-primary-lighter text-[10px] uppercase tracking-[0.25em] mb-6 font-medium">
                            Explore
                        </h4>
                        <ul className="space-y-3">
                            {navLinks.map(({ href, title }) => (
                                <li key={href}>
                                    <Link
                                        href={href}
                                        className="text-white/50 hover:text-white text-sm transition-colors duration-200"
                                    >
                                        {title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Contact */}
                    <div>
                        <h4 className="text-primary-lighter text-[10px] uppercase tracking-[0.25em] mb-6 font-medium">
                            Get in touch
                        </h4>
                        <p className="text-white/45 text-sm leading-relaxed max-w-xs">
                            Planning your next trip or want to collaborate?{' '}
                            <Link href="/contact" className="text-primary-lighter/70 hover:text-primary-lighter underline underline-offset-2 transition-colors">
                                Send us a message.
                            </Link>
                        </p>
                    </div>
                </div>
            </div>

            {/* Copyright bar */}
            <div className="relative border-t border-white/[0.07]">
                <div className="container mx-auto py-4 flex items-center justify-between gap-4">
                    <span className="text-white/25 text-xs">
                        © {year} Seabound Sessions. All rights reserved.
                    </span>
                    <span className="text-white/15 text-xs hidden sm:block">
                        Wind. Water. Freedom.
                    </span>
                </div>
            </div>
        </footer>
    )
}

export default Footer
