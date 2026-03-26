import { useEffect, useRef } from 'react'

// ── Constants ──────────────────────────────────────────────────────────────────
const FOV = 720
const VP_Y = 0.44           // vanishing point Y as fraction of canvas height
const CORRIDOR_X = 230      // half-width of corridor in world units
const RACK_INNER_X = CORRIDOR_X
const RACK_OUTER_X = CORRIDOR_X + 90
const RACK_TOP_Y = -200
const RACK_BOT_Y = 215
const FLOOR_Y = 260
const CEIL_Y = -310
const RACK_COUNT = 14
const RACK_SPACING = 190
const RACK_NEAR = 220
const CAM_SPEED = 17        // world units per second — slow, mesmerising

const LED_COLS = 7
const LED_ROWS = 20

const COLORS = {
  green:  '#00ee77',
  blue:   '#2288ff',
  cyan:   '#00ddcc',
  orange: '#ff8822',
  red:    '#ff2233',
  white:  '#ccddff',
}

const LED_PALETTE = [
  COLORS.green, COLORS.green, COLORS.green, COLORS.green,
  COLORS.blue,  COLORS.blue,  COLORS.blue,
  COLORS.cyan,  COLORS.cyan,
  COLORS.orange,COLORS.orange,
  COLORS.red,
  COLORS.white,
]

// ── Types ──────────────────────────────────────────────────────────────────────
interface LED { color: string; period: number; phase: number; alwaysOn: boolean }
interface Pulse { t: number; speed: number; color: string; trail: number; side: 'left'|'right'; cable: 'top'|'bot'|'ceil' }

// ── Helpers ────────────────────────────────────────────────────────────────────
const rnd = (min: number, max: number) => min + Math.random() * (max - min)
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

function makeLED(): LED {
  return {
    color: pick(LED_PALETTE),
    period: rnd(1.2, 7),
    phase: rnd(0, Math.PI * 2),
    alwaysOn: Math.random() < 0.32,
  }
}

function makePulse(): Pulse {
  return {
    t: Math.random(),
    speed: rnd(0.03, 0.08),
    color: pick([COLORS.cyan, COLORS.blue, COLORS.green, COLORS.white]),
    trail: rnd(0.06, 0.15),
    side: Math.random() < 0.5 ? 'left' : 'right',
    cable: pick(['top', 'bot', 'ceil']),
  }
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function DataCenterBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    // Pre-generate LED arrays — one per rack-side slot
    const rackLEDs: LED[][][] = Array.from({ length: RACK_COUNT },
      () => Array.from({ length: LED_ROWS }, () => Array.from({ length: LED_COLS }, makeLED)))

    // Rack z positions (relative to camZ = 0 at start)
    const rackZs: number[] = Array.from({ length: RACK_COUNT },
      (_, i) => RACK_NEAR + i * RACK_SPACING)

    // Data pulses
    const pulses: Pulse[] = Array.from({ length: 18 }, makePulse)

    let animId: number
    let t = 0
    let camZ = 0
    let prev = performance.now()

    // ── Projection ─────────────────────────────────────────────────────────────
    const proj = (wx: number, wy: number, wz: number) => {
      const cx = canvas.width / 2
      const cy = canvas.height * VP_Y
      if (wz <= 1) return null
      const s = FOV / wz
      return { x: cx + wx * s, y: cy + wy * s, s }
    }

    // Fog alpha (0 = invisible, 1 = fully visible)
    const fogAlpha = (wz: number) => {
      const far = RACK_NEAR + (RACK_COUNT - 1) * RACK_SPACING
      return Math.max(0.04, 1 - Math.pow((wz - RACK_NEAR) / (far * 1.1), 1.3))
    }

    // ── Draw background ─────────────────────────────────────────────────────────
    const drawBg = () => {
      const cx = canvas.width / 2
      const cy = canvas.height * VP_Y
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(canvas.width, canvas.height))
      grad.addColorStop(0,   '#07091a')
      grad.addColorStop(0.5, '#050813')
      grad.addColorStop(1,   '#020409')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    // ── Draw floor ──────────────────────────────────────────────────────────────
    const drawFloor = () => {
      const cx = canvas.width / 2
      const cy = canvas.height * VP_Y
      const vpY = cy

      // Floor quad from near-bottom to vanishing point
      const pFloorNear = proj(0, FLOOR_Y, RACK_NEAR - 60)
      const pFloorFar  = proj(0, FLOOR_Y, RACK_NEAR + RACK_COUNT * RACK_SPACING)
      if (!pFloorNear) return

      const nearY = pFloorNear.y
      const farY  = pFloorFar ? pFloorFar.y : vpY

      ctx.fillStyle = '#03050f'
      ctx.fillRect(0, nearY, canvas.width, canvas.height - nearY)

      // Grid lines converging to VP
      ctx.save()
      const lineCount = 10
      for (let i = -lineCount; i <= lineCount; i++) {
        const wx = i * 80
        const pNear = proj(wx, FLOOR_Y, RACK_NEAR - 60)
        if (!pNear) continue
        ctx.beginPath()
        ctx.moveTo(pNear.x, pNear.y)
        ctx.lineTo(cx, vpY)
        ctx.strokeStyle = 'rgba(20,50,90,0.35)'
        ctx.lineWidth = 0.8
        ctx.stroke()
      }
      // Horizontal cross-lines
      for (let d = 0; d < RACK_COUNT; d++) {
        const wz = RACK_NEAR + d * RACK_SPACING * 0.5
        const p = proj(0, FLOOR_Y, wz)
        const pL = proj(-2000, FLOOR_Y, wz)
        const pR = proj(2000, FLOOR_Y, wz)
        if (!p || !pL || !pR) continue
        ctx.beginPath()
        ctx.moveTo(pL.x, pL.y)
        ctx.lineTo(pR.x, pR.y)
        ctx.strokeStyle = `rgba(15,40,80,${0.25 * fogAlpha(wz)})`
        ctx.lineWidth = 0.6
        ctx.stroke()
      }
      ctx.restore()
    }

    // ── Draw ceiling cables ──────────────────────────────────────────────────────
    const drawCeiling = () => {
      const cx = canvas.width / 2
      const cy = canvas.height * VP_Y
      const cableXs = [-120, -50, 0, 50, 120]

      for (const wx of cableXs) {
        const pNear = proj(wx, CEIL_Y, RACK_NEAR - 50)
        if (!pNear) continue
        ctx.beginPath()
        ctx.moveTo(pNear.x, pNear.y)
        ctx.lineTo(cx + (wx / (RACK_NEAR + RACK_COUNT * RACK_SPACING)) * FOV, cy)
        ctx.strokeStyle = 'rgba(20,40,80,0.5)'
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
    }

    // ── Draw one rack ────────────────────────────────────────────────────────────
    const drawRack = (wz: number, rackIdx: number) => {
      const fa = fogAlpha(wz)
      if (fa < 0.04) return

      for (const side of ['left', 'right'] as const) {
        const sx = side === 'left' ? -1 : 1

        const iX = sx * RACK_INNER_X
        const oX = sx * RACK_OUTER_X

        const pIT = proj(iX, RACK_TOP_Y, wz)
        const pIB = proj(iX, RACK_BOT_Y, wz)
        const pOT = proj(oX, RACK_TOP_Y, wz)
        const pOB = proj(oX, RACK_BOT_Y, wz)
        if (!pIT || !pIB || !pOT || !pOB) continue

        ctx.save()
        ctx.globalAlpha = fa

        // ── Side face (depth) ───────────────────────────────────────────────
        ctx.beginPath()
        ctx.moveTo(pIT.x, pIT.y)
        ctx.lineTo(pOT.x, pOT.y)
        ctx.lineTo(pOB.x, pOB.y)
        ctx.lineTo(pIB.x, pIB.y)
        ctx.closePath()
        ctx.fillStyle = '#050810'
        ctx.fill()

        // ── Front face ──────────────────────────────────────────────────────
        const faceW = Math.abs(pIT.x - pOT.x)   // width of side, used as depth hint
        // Actual front face is the inner edge projected to near z
        // We fake the front face as a rect from pIT to pIB using projected scale
        const fW = pIT.s * RACK_OUTER_X * 1.8  // approximate screen width of face
        const fLeft  = side === 'left' ? pIT.x - fW : pIT.x
        const fRight = side === 'left' ? pIT.x       : pIT.x + fW
        const fTop   = pIT.y
        const fBot   = pIB.y
        const fH     = fBot - fTop

        // Rack body
        ctx.beginPath()
        ctx.rect(fLeft, fTop, fRight - fLeft, fH)
        ctx.fillStyle = '#080c1c'
        ctx.fill()

        // Rack frame highlight
        ctx.strokeStyle = '#1a2d50'
        ctx.lineWidth = 1
        ctx.stroke()

        // Rack unit dividers (horizontal lines)
        const unitH = fH / LED_ROWS
        ctx.strokeStyle = 'rgba(20,45,80,0.4)'
        ctx.lineWidth = 0.5
        for (let r = 1; r < LED_ROWS; r++) {
          const ry = fTop + r * unitH
          ctx.beginPath()
          ctx.moveTo(fLeft + 2, ry)
          ctx.lineTo(fRight - 2, ry)
          ctx.stroke()
        }

        // ── LED grid ────────────────────────────────────────────────────────
        const ledAreaLeft  = fLeft  + (fRight - fLeft) * 0.08
        const ledAreaRight = fRight - (fRight - fLeft) * 0.08
        const ledAreaTop   = fTop   + fH * 0.05
        const ledAreaBot   = fBot   - fH * 0.05
        const ledW = (ledAreaRight - ledAreaLeft) / LED_COLS
        const ledH = (ledAreaBot   - ledAreaTop)  / LED_ROWS
        const ledR = Math.min(ledW, ledH) * 0.22

        for (let row = 0; row < LED_ROWS; row++) {
          for (let col = 0; col < LED_COLS; col++) {
            const led = rackLEDs[rackIdx][row][col]
            const lx = ledAreaLeft + (col + 0.5) * ledW
            const ly = ledAreaTop  + (row + 0.5) * ledH

            // Brightness: sine-based blink
            let bright: number
            if (led.alwaysOn) {
              bright = 0.7 + 0.3 * Math.sin(t * 0.4 + led.phase)
            } else {
              const v = Math.sin(t / led.period * Math.PI * 2 + led.phase)
              bright = v > 0.1 ? 0.5 + 0.5 * v : 0
            }
            if (bright < 0.05) continue

            ctx.globalAlpha = fa * bright

            // Glow
            if (pIT.s > 0.15 && ledR > 1) {
              const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, ledR * 4)
              glow.addColorStop(0, led.color + 'aa')
              glow.addColorStop(1, led.color + '00')
              ctx.fillStyle = glow
              ctx.beginPath()
              ctx.arc(lx, ly, ledR * 4, 0, Math.PI * 2)
              ctx.fill()
            }

            // Core dot
            ctx.globalAlpha = fa * Math.min(1, bright * 1.3)
            ctx.fillStyle = led.color
            ctx.beginPath()
            ctx.arc(lx, ly, Math.max(0.5, ledR), 0, Math.PI * 2)
            ctx.fill()
          }
        }

        // ── Cable runs (top + bottom of rack) ──────────────────────────────
        ctx.globalAlpha = fa * 0.7
        const cableY = [fTop + 3, fBot - 3]
        for (const cy2 of cableY) {
          ctx.beginPath()
          ctx.moveTo(fLeft, cy2)
          ctx.lineTo(fRight, cy2)
          ctx.strokeStyle = '#0a1a30'
          ctx.lineWidth = 3
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(fLeft, cy2)
          ctx.lineTo(fRight, cy2)
          ctx.strokeStyle = '#1a3060'
          ctx.lineWidth = 1
          ctx.stroke()
        }

        ctx.restore()

        // ── Data pulse dots along cable runs ───────────────────────────────
        for (const pulse of pulses) {
          if (pulse.side !== side) continue
          if (pulse.cable !== 'top' && pulse.cable !== 'bot') continue

          const cY = pulse.cable === 'top' ? fTop + 3 : fBot - 3
          // t=0 is far end, t=1 is near end (left for left side, right for right side)
          const px = side === 'left'
            ? fRight - pulse.t * (fRight - fLeft)
            : fLeft  + pulse.t * (fRight - fLeft)

          if (px < Math.min(fLeft, fRight) || px > Math.max(fLeft, fRight)) continue

          ctx.save()
          ctx.globalAlpha = fa * 0.9

          // Trail
          const trailLen = (fRight - fLeft) * pulse.trail
          const trailDir = side === 'left' ? 1 : -1
          const trailGrad = ctx.createLinearGradient(px, cY, px + trailDir * trailLen, cY)
          trailGrad.addColorStop(0, pulse.color + 'cc')
          trailGrad.addColorStop(1, pulse.color + '00')
          ctx.beginPath()
          ctx.moveTo(px, cY)
          ctx.lineTo(px + trailDir * trailLen, cY)
          ctx.strokeStyle = trailGrad
          ctx.lineWidth = 2
          ctx.stroke()

          // Dot
          ctx.shadowColor = pulse.color
          ctx.shadowBlur = 6
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(px, cY, 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0

          ctx.restore()
        }
      }
    }

    // ── Draw ceiling data pulses ─────────────────────────────────────────────────
    const drawCeilingPulses = () => {
      const cx = canvas.width / 2
      const vpY = canvas.height * VP_Y

      for (const pulse of pulses) {
        if (pulse.cable !== 'ceil') continue

        // pulse.t = 0 (far, near VP) → 1 (near camera)
        const wz = RACK_NEAR + (1 - pulse.t) * RACK_COUNT * RACK_SPACING
        const p  = proj(pulse.side === 'left' ? -60 : 60, CEIL_Y, wz)
        if (!p) continue

        const fa = fogAlpha(wz)
        ctx.save()
        ctx.globalAlpha = fa * 0.85
        ctx.shadowColor = pulse.color
        ctx.shadowBlur = 8
        ctx.fillStyle = pulse.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2.5 * p.s, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.restore()
      }
    }

    // ── Draw ambient glow at base of racks ───────────────────────────────────────
    const drawFloorGlow = () => {
      for (let i = 0; i < RACK_COUNT; i++) {
        const wz = rackZs[i] - camZ
        if (wz <= 0) continue
        const fa = fogAlpha(wz) * 0.35
        for (const side of ['left', 'right'] as const) {
          const sx = side === 'left' ? -1 : 1
          const p = proj(sx * RACK_INNER_X, RACK_BOT_Y, wz)
          if (!p) continue
          const gw = p.s * RACK_OUTER_X * 3
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, gw)
          grad.addColorStop(0, `rgba(0,100,200,${fa})`)
          grad.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, gw, gw * 0.3, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    // ── Vignette ─────────────────────────────────────────────────────────────────
    const drawVignette = () => {
      const cx = canvas.width / 2
      const cy = canvas.height / 2
      const r = Math.max(canvas.width, canvas.height)
      const grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 0.85)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(1, 'rgba(0,0,10,0.72)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    // ── Main render loop ─────────────────────────────────────────────────────────
    const frame = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.05)
      prev = now
      t += dt
      camZ += CAM_SPEED * dt

      // Advance pulses
      for (const p of pulses) {
        p.t += p.speed * dt
        if (p.t > 1.1) {
          p.t = -p.trail
          p.speed = rnd(0.03, 0.08)
          p.color = pick([COLORS.cyan, COLORS.blue, COLORS.green, COLORS.white])
          p.side  = Math.random() < 0.5 ? 'left' : 'right'
          p.cable = pick(['top', 'bot', 'ceil'])
        }
      }

      // Update rack z positions — cycle racks that pass behind camera back to far end
      const maxZ = RACK_NEAR + (RACK_COUNT - 1) * RACK_SPACING
      for (let i = 0; i < RACK_COUNT; i++) {
        rackZs[i] -= CAM_SPEED * dt
        if (rackZs[i] < 30) {
          rackZs[i] += RACK_COUNT * RACK_SPACING
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      drawBg()
      drawFloor()
      drawCeiling()
      drawFloorGlow()

      // Draw racks back-to-front for correct overdraw
      const sorted = [...rackZs.entries()].sort((a, b) => b[1] - a[1])
      for (const [idx, wz] of sorted) {
        if (wz > 30) drawRack(wz, idx)
      }

      drawCeilingPulses()
      drawVignette()

      animId = requestAnimationFrame(frame)
    }

    animId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  )
}
