import { useCallback, useMemo, useState, type CSSProperties, type JSX } from 'react'

import type { Shader, HtmlInCanvasElement } from '../types.js'
import { useProcessMaskUrl } from '../mask.js'
import { useShaderRuntime } from '../useShaderRuntime.js'

export type ShaderFillProps = {
  shader: Shader
  width?: number
  height?: number
  className?: string
  style?: CSSProperties
  // A CSS `mask` value (e.g. `url("…")`) clipping the canvas to the node's vector shape.
  mask?: string
}

export function ShaderFill({
  shader,
  width,
  height,
  className,
  style,
  mask,
}: ShaderFillProps): JSX.Element | null {
  const [canvas, setCanvas] = useState<HtmlInCanvasElement | null>(null)
  // Keep the array identity stable so the runtime's setup effect doesn't re-run each render.
  const shaders = useMemo(() => [shader], [shader])
  const { error } = useShaderRuntime({ canvas, shaders, hasChildren: false })
  const processedMask = useProcessMaskUrl(mask)

  // Stable ref callback — an inline arrow would re-bind every render, which can cause
  // React to call the callback with null then with the canvas on each commit, tearing
  // down and re-acquiring the WebGPU device.
  const canvasRef = useCallback((ref: HTMLCanvasElement | null) => {
    setCanvas(ref as unknown as HtmlInCanvasElement | null)
  }, [])

  const sizeStyle =
    width !== undefined && height !== undefined
      ? { width: `${width}px`, height: `${height}px` }
      : { width: '100%', height: '100%' }
  return error !== null ? null : (
    <canvas
      className={className}
      style={{
        display: 'block',
        ...(processedMask && { mask: processedMask }),
        pointerEvents: 'none',
        ...sizeStyle,
        ...style,
      }}
      ref={canvasRef}
    />
  )
}
