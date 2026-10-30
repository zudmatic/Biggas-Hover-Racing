import { useCallback, useRef, useState, type JSX, type ReactNode } from 'react'

import type { Shader, HtmlInCanvasElement } from '../types.js'
import { useProcessMaskUrl } from '../mask.js'
import { useShaderRuntime } from '../useShaderRuntime.js'

export type ShaderEffectProps = {
  children?: ReactNode
  shaders: Shader[]
  className?: string
  // A CSS `mask` value (e.g. `url("…")`) clipping the canvas to the node's vector shape. The fill is
  // emitted as a sibling of the node's shape, so the mask resolves to the same vector asset.
  mask?: string
}

export function ShaderEffect({
  children,
  shaders,
  className,
  mask,
}: ShaderEffectProps): JSX.Element {
  const [canvas, setCanvas] = useState<HtmlInCanvasElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const hasChildren = children != null
  const { error } = useShaderRuntime({ canvas, shaders, hasChildren, contentRef })
  const processedMask = useProcessMaskUrl(mask)

  // Stable ref callback — an inline arrow would re-bind every render, which can cause
  // React to call the callback with null then with the canvas on each commit, tearing
  // down and re-acquiring the WebGPU device.
  const canvasRef = useCallback((ref: HTMLCanvasElement | null) => {
    setCanvas(ref as unknown as HtmlInCanvasElement | null)
  }, [])

  // These are needed since putting the attributes directly on our HTML elements wouldn't
  // pass typechecking, as they are new attributes.
  const canvasAttrs = hasChildren
    ? { layoutsubtree: '', content: 'drawable' }
    : ({} as Record<string, unknown>)
  const drawableAttrs = { drawable: '' } as Record<string, string>

  return error !== null ? (
    <>{children}</>
  ) : (
    <canvas
      className={className}
      style={{
        display: 'block',
        ...(processedMask && { mask: processedMask }),
        pointerEvents: hasChildren ? undefined : 'none',
      }}
      ref={canvasRef}
      {...canvasAttrs}
    >
      {hasChildren ? (
        <div
          ref={contentRef}
          style={{ position: 'relative', width: '100%', height: '100%' }}
          {...drawableAttrs}
        >
          {children}
        </div>
      ) : null}
    </canvas>
  )
}
