import { useEffect, useRef } from 'react'

const ROW = 34

/** iOS-style picker: scroll-snap list with a selection band. Tap a row to pick it. */
export function Wheel({ items, index, onChange, label }: { items: string[]; index: number; onChange: (i: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    ref.current?.scrollTo({ top: index * ROW })
    // set the starting position only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onScroll = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const i = Math.max(0, Math.min(items.length - 1, Math.round((ref.current?.scrollTop ?? 0) / ROW)))
      if (i !== index) onChange(i)
    }, 90)
  }

  return (
    <div className="wheel">
      <div className="band" />
      <div className="wheel-list" ref={ref} onScroll={onScroll} role="listbox" aria-label={label}>
        {items.map((it, i) => (
          <button
            key={it}
            type="button"
            role="option"
            aria-selected={i === index}
            className={i === index ? 'sel' : ''}
            onClick={() => {
              onChange(i)
              ref.current?.scrollTo({ top: i * ROW, behavior: 'smooth' })
            }}
          >
            {it}
          </button>
        ))}
      </div>
    </div>
  )
}
