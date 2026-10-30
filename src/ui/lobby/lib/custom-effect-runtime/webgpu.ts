import { useEffect, useState } from 'react'

// Module-level singleton. Acquiring a GPUDevice is expensive and a single device can
// back every ShaderEffect on the page, so we acquire it once and hand the same promise
// to all callers rather than one device per component.
let devicePromise: Promise<GPUDevice> | null = null

// Requests the adapter and device on first call and caches the promise. On failure the
// cache is cleared so a later mount can retry.
function acquireDevice(): Promise<GPUDevice> {
  if (!devicePromise) {
    devicePromise = (async () => {
      const gpu = navigator.gpu
      if (!gpu) {
        throw new Error('WebGPU unsupported.')
      }
      const adapter = await gpu.requestAdapter()
      if (!adapter) {
        throw new Error('Failed to get WebGPU adapter.')
      }
      // TODO: observe `device.lost` to surface driver crashes / OOM / browser-induced
      // device loss and re-acquire instead of leaving every canvas silently broken.
      return adapter.requestDevice()
    })()
    devicePromise.catch(() => {
      devicePromise = null
    })
  }
  return devicePromise
}

/**
 * Shares one WebGPU device across every ShaderEffect. The device is initialized once and
 * never destroyed for the page lifetime, so multiple effects can render against it.
 * Returns the device once ready (null until then) and any acquisition error.
 */
export function useWebGPUDevice(): { device: GPUDevice | null; error: Error | null } {
  const [device, setDevice] = useState<GPUDevice | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    void acquireDevice().then(
      (acquired) => {
        if (!cancelled) {
          setDevice(acquired)
        }
      },
      (e) => {
        if (!cancelled) {
          console.warn('Failed to acquire WebGPU device', e)
          setError(e instanceof Error ? e : new Error(String(e)))
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return { device, error }
}
