import QRCode from 'qrcode'
import { useMemo } from 'react'

/** Renders the pass QR as an SVG path, so it stays crisp and works offline. */
export function Qr({ text, size = 176, label }: { text: string; size?: number; label: string }) {
  const d = useMemo(() => {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    let path = ''
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) path += 'M' + x + ' ' + y + 'h1v1h-1z'
    return { path, n }
  }, [text])
  return (
    <div className="qr" style={{ padding: 12 }}>
      <svg viewBox={'-1 -1 ' + (d.n + 2) + ' ' + (d.n + 2)} role="img" aria-label={label} style={{ width: size, height: size, shapeRendering: 'crispEdges' }}>
        <path d={d.path} />
      </svg>
    </div>
  )
}
