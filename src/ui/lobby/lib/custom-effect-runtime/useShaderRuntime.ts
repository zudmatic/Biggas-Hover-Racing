import { useEffect, useRef, useState, type RefObject } from 'react'

import type {
  CustomEffectState,
  Shader,
  GpuState,
  HtmlInCanvasElement,
  HtmlInCanvasQueue,
  Manifest,
  MousePosition,
  PaintEvent,
  ShaderData,
} from './types.js'
import { useWebGPUDevice } from './webgpu.js'

class RuntimeState {
  gpu: GpuState
  input: GPUTexture | null
  output: GPUTexture | null = null
  shaderData: ShaderData[] = []
  // An array of 2 textures that we alternate between for rendering multiple shaders
  // in sequence.
  intermediateTextures: GPUTexture[] = []

  _time = 0
  _deltaTime = 0
  _frame = 0
  _mousePosition: MousePosition = { x: 0, y: 0, down: false }

  // Driven by each shader's manifest (see DEFAULT_MANIFEST); set when effects are applied.
  isAnimated = false
  usesMouse = false

  constructor(gpu: GpuState, input: GPUTexture | null) {
    this.gpu = gpu
    this.input = input
  }

  getShaderState(index: number): CustomEffectState {
    const renderScale = window.devicePixelRatio || 1
    return {
      gpu: this.gpu,
      input: index === 0 ? this.input : this.intermediateTextures[index % 2]!,
      output:
        index === this.shaderData.length - 1
          ? this.output
          : this.intermediateTextures[(index + 1) % 2]!,
      time: this._time,
      deltaTime: this._deltaTime,
      frame: this._frame,
      mousePosition: this._mousePosition,
      renderScale,
      params: this.shaderData[index]!.shader.params,
      state: this.shaderData[index]!.state,
    }
  }

  createIntermediateTexture(input: GPUTexture): GPUTexture {
    return this.gpu.device.createTexture({
      size: [input.width, input.height, 1],
      format: this.gpu.format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    })
  }

  // This is a no-op if input is null or if the input texture dimensions already matches the
  // existing intermediate texture dimensions.
  updateIntermediateTextures() {
    if (!this.input) {
      return
    }

    const { width, height } = this.input
    const currentIntermediateTextures = this.intermediateTextures

    // Do not recreate intermediate textures if canvas size hasn't changed.
    if (
      currentIntermediateTextures[0]?.width === width &&
      currentIntermediateTextures[0]?.height === height
    ) {
      return
    }

    this.intermediateTextures.forEach((texture) => {
      texture.destroy()
    })
    this.intermediateTextures = [
      this.createIntermediateTexture(this.input),
      this.createIntermediateTexture(this.input),
    ]
  }
}

export const DEFAULT_MANIFEST: Manifest = {
  version: 2,
  isAnimated: false,
  usesMouse: false,
  name: '',
}

// Wrapper for the current draw API and both versions of the earlier copy API.
// See https://github.com/WICG/html-in-canvas/issues/174.
function copyElementImageToInputTexture(content: Element, runtime: RuntimeState) {
  if (!runtime.input) {
    throw new Error('Cannot copy to null input texture')
  }
  const queue: HtmlInCanvasQueue = runtime.gpu.device.queue

  if (queue.drawElementImageToTexture) {
    try {
      queue.drawElementImageToTexture(
        { source: content },
        {
          texture: runtime.input,
          size: {
            width: runtime.input.width,
            height: runtime.input.height,
          },
        },
      )
      return
    } catch (error) {
      // Older HTML-in-Canvas implementations use copyElementImageToTexture.
      if (!queue.copyElementImageToTexture) {
        throw error
      }
    }
  }

  if (!queue.copyElementImageToTexture) {
    throw new Error('HTML-in-Canvas is not supported.')
  }
  try {
    queue.copyElementImageToTexture(
      { source: content },
      {
        destination: { texture: runtime.input },
        width: runtime.input.width,
        height: runtime.input.height,
      },
    )
  } catch {
    const legacyQueue = queue as unknown as {
      copyElementImageToTexture: (
        content: Element,
        width: number,
        height: number,
        destination: { texture: GPUTexture },
      ) => void
    }
    legacyQueue.copyElementImageToTexture(content, runtime.input.width, runtime.input.height, {
      texture: runtime.input,
    })
  }
}

/**
 * Drives the WebGPU render loop for a stack of shader effects against a single canvas. Shared
 * by ShaderEffect (optionally with a rasterized DOM subtree) and ShaderFill (procedural only).
 * - canvas / contentRef: the render target and, when hasChildren, the subtree to rasterize
 * - shaders / hasChildren: the effect chain and whether an input texture is sourced from the DOM
 */
export function useShaderRuntime({
  canvas,
  shaders,
  hasChildren,
  contentRef,
}: {
  canvas: HtmlInCanvasElement | null
  shaders: Shader[]
  hasChildren: boolean
  contentRef?: RefObject<HTMLDivElement | null>
}): { error: Error | null } {
  const runtimeRef = useRef<RuntimeState | null>(null)
  const setupCompleteRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const renderCoreRef = useRef<() => void>(() => {})
  const startClockRef = useRef<() => void>(() => {})
  const stopClockRef = useRef<() => void>(() => {})
  const schedulePaintRef = useRef<() => void>(() => {})
  const isDirtiedRef = useRef(true)
  // The shared WebGPU device is initialized once and reused across every effect.
  const { device, error: deviceError } = useWebGPUDevice()
  // Per-canvas context setup failures (missing context, HTML-in-Canvas unsupported, texture
  // allocation) are not generally retryable, so `error` is a one-way latch and there is
  // intentionally no recovery path. Per-frame render failures are treated as transient (see
  // onpaint catch below) and don't flip this latch.
  const [error, setError] = useState<Error | null>(null)
  const [deviceReady, setDeviceReady] = useState(false)

  useEffect(() => {
    startClockRef.current = () => {
      if (rafRef.current != null) {
        return
      }
      lastTsRef.current = null
      const tick = (ts: number) => {
        const runtime = runtimeRef.current
        if (!runtime) {
          rafRef.current = null
          return
        }
        rafRef.current = requestAnimationFrame(tick)
        runtime._deltaTime = lastTsRef.current == null ? 0 : ts - lastTsRef.current
        lastTsRef.current = ts
        runtime._time += runtime._deltaTime
        runtime._frame += 1
        schedulePaintRef.current()
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    stopClockRef.current = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      lastTsRef.current = null
    }

    schedulePaintRef.current = () => {
      if (hasChildren) {
        canvas?.requestPaint()
      } else {
        renderCoreRef.current()
      }
    }

    renderCoreRef.current = () => {
      // Skip until the current effect's setup() has completed. Otherwise an early paint
      // (e.g. from a params-sync requestPaint() before the setup useEffect has run, or
      // immediately after an effect swap) would call render() against an uninitialized
      // pipeline state.
      if (!setupCompleteRef.current) {
        return
      }
      const runtime = runtimeRef.current
      if (!runtime || !runtime.input) {
        return
      }
      const content = contentRef?.current ?? null
      if (hasChildren && !content) {
        return
      }
      try {
        if (hasChildren && content && isDirtiedRef.current) {
          copyElementImageToInputTexture(content, runtime)
          isDirtiedRef.current = false
        }
        runtime.updateIntermediateTextures()
        runtime.output = runtime.gpu.context.getCurrentTexture()
        shaders.forEach((effect, idx) => {
          effect.render(runtime.gpu.device, runtime.getShaderState(idx))
        })
      } catch (e) {
        // Render-path failures are treated as transient — e.g. "No cached paint record
        // for element" on the very first paint before the browser has produced a paint
        // record for the content subtree, or a briefly detached element. The next paint
        // typically succeeds, so we log and continue rather than latching the error.
        console.warn('Failed to render effect', e)
        return
      }
      if (runtime.isAnimated) {
        startClockRef.current()
      } else {
        stopClockRef.current()
      }
    }
  })

  // Configure the canvas context and allocate the input texture against the shared device.
  // Survives effect swaps; re-runs when the canvas or device changes.
  useEffect(() => {
    if (!canvas || !device) {
      return
    }
    let input: GPUTexture | null = null
    try {
      const context = canvas.getContext('webgpu')
      if (!context) {
        throw new Error('Failed to get WebGPU context.')
      }

      // Check for either HTML-in-Canvas queue method.
      // Only required when there are children to copy into the input texture; pure-GPU
      // effects with no DOM content leave the input as an empty (zeroed) texture.
      if (
        hasChildren &&
        !('drawElementImageToTexture' in device.queue) &&
        !('copyElementImageToTexture' in device.queue)
      ) {
        throw new Error('HTML-in-Canvas is not supported.')
      }

      const format: GPUTextureFormat = 'rgba8unorm'
      context.configure({ device, format, alphaMode: 'premultiplied' })
      const canvasRect = canvas.getBoundingClientRect()
      const renderScale = window.devicePixelRatio || 1
      canvas.width = Math.max(Math.round(canvasRect.width * renderScale), 1)
      canvas.height = Math.max(Math.round(canvasRect.height * renderScale), 1)
      // RENDER_ATTACHMENT is mandatory on the destination of
      // HTML-in-Canvas in Chrome's implementation. Without it,
      // the call doesn't throw but silently writes nothing — the texture
      // stays zeroed. (Dawn emits "Destination texture needs to have CopyDst
      // and RenderAttachment usage." as a warning, but no exception.)

      input = device.createTexture({
        size: [canvas.width, canvas.height, 1],
        format,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      })

      runtimeRef.current = new RuntimeState({ device, context, format }, input)
      isDirtiedRef.current = true
      setDeviceReady(true)
    } catch (e) {
      // Destroy the input texture if it was created before the throw. The shared device is
      // owned by useWebGPUDevice and is intentionally left alive.
      input?.destroy()
      console.warn('Failed to initialize shader runtime', e)
      setError(e instanceof Error ? e : new Error(String(e)))
    }

    return () => {
      stopClockRef.current()
      const runtime = runtimeRef.current
      if (runtime) {
        runtime.input?.destroy()
        for (const texture of runtime.intermediateTextures) {
          texture.destroy()
        }
        runtimeRef.current = null
      }
      setDeviceReady(false)
    }
  }, [canvas, hasChildren, device])

  // Run effect-specific setup. Resets per-effect bookkeeping but keeps the device.
  // setupCompleteRef gates onpaint so render() can never observe a half-initialized
  // effect (e.g. between an effect swap and its setup running).
  useEffect(() => {
    if (!deviceReady) {
      return
    }
    const runtime = runtimeRef.current
    if (!runtime) {
      return
    }
    setupCompleteRef.current = false
    stopClockRef.current()
    runtime._time = 0
    runtime._deltaTime = 0
    runtime._frame = 0
    runtime.output = null
    // Animation and mouse wiring are declared by each shader's manifest, not probed at runtime.
    runtime.isAnimated = shaders.some((effect) => (effect.manifest ?? DEFAULT_MANIFEST).isAnimated)
    runtime.usesMouse = shaders.some((effect) => (effect.manifest ?? DEFAULT_MANIFEST).usesMouse)
    runtime.shaderData = shaders.map((effect) => {
      return {
        shader: effect,
        state: {},
      }
    })
    try {
      runtime.updateIntermediateTextures()
      shaders.forEach((effect, idx) => {
        effect.setup(runtime.gpu.device, runtime.getShaderState(idx))
      })
      setupCompleteRef.current = true
      schedulePaintRef.current()
    } catch (e) {
      console.warn('Failed to set up effect', e)
      setError(e instanceof Error ? e : new Error(String(e)))
    }
    return () => {
      setupCompleteRef.current = false
    }
  }, [shaders, deviceReady, canvas, hasChildren])

  useEffect(() => {
    if (!canvas || !deviceReady || !hasChildren) {
      return
    }
    canvas.onpaint = (event: PaintEvent) => {
      if (event.changedElements.length > 0) {
        isDirtiedRef.current = true
      }
      renderCoreRef.current()
    }
    return () => {
      canvas.onpaint = null
    }
  }, [canvas, deviceReady, hasChildren])

  // Track device-pixel size so the canvas grid stays crisp.
  useEffect(() => {
    if (!canvas || !deviceReady) {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const renderScale = window.devicePixelRatio || 1
      for (const entry of entries) {
        const size = entry.contentBoxSize?.[0]
        canvas.width = Math.max(
          Math.round((size?.inlineSize ?? entry.contentRect.width) * renderScale),
          1,
        )
        canvas.height = Math.max(
          Math.round((size?.blockSize ?? entry.contentRect.height) * renderScale),
          1,
        )
      }

      // Recreate the scratch input texture after resize.
      const runtime = runtimeRef.current
      if (runtime) {
        runtime.input?.destroy()
        try {
          runtime.input = runtime.gpu.device.createTexture({
            size: [canvas.width, canvas.height, 1],
            format: runtime.gpu.format,
            usage:
              GPUTextureUsage.TEXTURE_BINDING |
              GPUTextureUsage.COPY_DST |
              GPUTextureUsage.RENDER_ATTACHMENT,
          })
          isDirtiedRef.current = true
          runtime.updateIntermediateTextures()
        } catch (e) {
          console.warn('Failed to create texture after resizing', e)
          setError(e instanceof Error ? e : new Error(String(e)))
        }
        schedulePaintRef.current()
      }
    })
    resizeObserver.observe(canvas, { box: 'device-pixel-content-box' })

    return () => resizeObserver.disconnect()
  }, [canvas, deviceReady, hasChildren])

  useEffect(() => {
    if (!canvas || !deviceReady) {
      return
    }

    const mouseSync = (runtime: RuntimeState, e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        return
      }
      runtime._mousePosition.x = ((e.clientX - rect.left) * canvas.width) / rect.width
      runtime._mousePosition.y = ((e.clientY - rect.top) * canvas.height) / rect.height
    }

    // The rAF clock already repaints animated effects, so only repaint here when
    // it isn't running (a mouse-only, non-animated effect).
    const repaint = () => {
      if (rafRef.current == null) {
        schedulePaintRef.current()
      }
    }

    const onMove = (e: PointerEvent) => {
      const runtime = runtimeRef.current
      if (!runtime || !runtime.usesMouse) {
        return
      }
      mouseSync(runtime, e)
      repaint()
    }
    const onDown = (e: PointerEvent) => {
      const runtime = runtimeRef.current
      if (e.button !== 0 || !runtime || !runtime.usesMouse) {
        return
      }
      runtime._mousePosition.down = true
      mouseSync(runtime, e)
      repaint()
    }
    const clearDown = () => {
      const runtime = runtimeRef.current
      if (!runtime || !runtime.usesMouse || !runtime._mousePosition.down) {
        return
      }
      runtime._mousePosition.down = false
      repaint()
    }
    const onUp = (e: PointerEvent) => {
      if (e.button === 0) {
        clearDown()
      }
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', clearDown, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', clearDown)
    }
  }, [canvas, deviceReady, hasChildren])

  return { error: deviceError ?? error }
}
