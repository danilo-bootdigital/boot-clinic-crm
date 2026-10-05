'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Quadro de assinatura com o dedo/caneta/mouse (Pointer Events — cobre toque e
// mouse com o mesmo código). Fundo branco fixo: assinatura é traço escuro sobre
// claro, e no tema escuro ela sumiria.
//
// Devolve PNG em data URL via onChange (null quando vazio). O canvas é
// redimensionado pelo devicePixelRatio para o traço não sair serrilhado em
// tela retina.

export function SignaturePad({
  onChange,
  disabled = false,
}: {
  onChange: (dataUrl: string | null) => void
  disabled?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const strokes = useRef(0)
  const [empty, setEmpty] = useState(true)
  // onChange em ref: se o pai passar função inline, o quadro não pode ser
  // reiniciado (e apagado) a cada render.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const setup = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    const ctx = canvas.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.4
    ctx.strokeStyle = '#111827'
    strokes.current = 0
    setEmpty(true)
    onChangeRef.current(null)
  }, [])

  useEffect(() => {
    setup()
    // Girar o celular muda o tamanho do quadro; recomeçar é melhor que deformar.
    window.addEventListener('orientationchange', setup)
    return () => window.removeEventListener('orientationchange', setup)
  }, [setup])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
    const ctx = e.currentTarget.getContext('2d')!
    ctx.beginPath()
    ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2)
    ctx.fillStyle = '#111827'
    ctx.fill()
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return
    e.preventDefault()
    const p = point(e)
    const ctx = e.currentTarget.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    strokes.current += 1
    setEmpty(false)
    onChangeRef.current(canvasRef.current!.toDataURL('image/png'))
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-border bg-white">
        <canvas
          ref={canvasRef}
          aria-label="Quadro de assinatura"
          className="block h-44 w-full touch-none select-none sm:h-52"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Assine aqui com o dedo
          </span>
        )}
        <div className="pointer-events-none absolute bottom-9 left-6 right-6 border-b border-dashed border-gray-300" />
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={setup}
          disabled={disabled || empty}
          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Limpar assinatura
        </button>
      </div>
    </div>
  )
}
