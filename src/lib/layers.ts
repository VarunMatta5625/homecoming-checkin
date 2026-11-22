import { useEffect, useRef } from 'react'

/**
 * Sheets and alerts take a history entry, so the Android back button (and the iOS swipe) closes the
 * top-most one instead of leaving the app.
 */
interface Layer {
  close: () => void
  popped: boolean
}
const stack: Layer[] = []
let ignore = 0

addEventListener('popstate', () => {
  if (ignore > 0) {
    ignore--
    return
  }
  const top = stack.pop()
  if (top) {
    top.popped = true
    top.close()
  }
})

export function useLayer(close: () => void) {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => {
    const layer: Layer = { close: () => ref.current(), popped: false }
    stack.push(layer)
    history.pushState({ gh: 'layer' }, '')
    return () => {
      const i = stack.indexOf(layer)
      if (i >= 0) stack.splice(i, 1)
      if (!layer.popped) {
        ignore++
        history.back()
      }
    }
  }, [])
}

/** Close every open sheet, then run `then`. Use before navigating from inside a sheet. */
export function leaveLayers(then: () => void) {
  const layers = stack.splice(0, stack.length)
  if (!layers.length) return then()
  layers.forEach((l) => (l.popped = true))
  const done = () => {
    removeEventListener('popstate', done)
    layers.forEach((l) => l.close())
    then()
  }
  addEventListener('popstate', done)
  history.go(-layers.length)
}
