// resources/js/Components/Map/ClickToInteract.tsx
//
// Scroll guard for embedded maps. Until the visitor clicks the map, a
// transparent overlay sits over it so wheel and touch-drag gestures scroll the
// PAGE instead of zooming/panning the map (full-width maps otherwise trap the
// scroll as soon as the cursor passes over them). Clicking removes the overlay;
// leaving the map (mouse) or tapping elsewhere (touch) puts it back.

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
    children: ReactNode
    className?: string
}

/**
 * Wrap a map so it only becomes interactive after an explicit click.
 */
const ClickToInteract = ({ children, className = '' }: Props) => {
    const [isActive, setIsActive] = useState(false)
    const wrapperRef = useRef<HTMLDivElement | null>(null)

    // Touch devices never fire mouseleave, so a tap outside the map is what
    // hands scrolling back to the page there.
    useEffect(() => {
        if (!isActive) return
        /** Deactivate when a pointer goes down anywhere outside the map. */
        const handlePointerDown = (event: PointerEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsActive(false)
            }
        }
        document.addEventListener('pointerdown', handlePointerDown)
        return () => document.removeEventListener('pointerdown', handlePointerDown)
    }, [isActive])

    return (
        <div ref={wrapperRef} className={`group relative ${className}`} onMouseLeave={() => setIsActive(false)}>
            {children}
            {!isActive && (
                <button
                    type="button"
                    onClick={() => setIsActive(true)}
                    className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer"
                    aria-label="Click to interact with the map"
                >
                    {/* Always shown on touch screens; on desktop it appears on hover so it doesn't sit over the markers. */}
                    <span className="bg-secondary/85 backdrop-blur-sm text-white text-xs uppercase tracking-wide px-4 py-2.5 shadow-lg transition-opacity duration-300 lg:opacity-0 lg:group-hover:opacity-100">
                        Click to explore the map
                    </span>
                </button>
            )}
        </div>
    )
}

export default ClickToInteract
