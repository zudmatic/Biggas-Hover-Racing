// Surface for HTML-in-canvas additions that aren't in the standard lib yet.
// See: https://github.com/WICG/html-in-canvas

export type HtmlInCanvas = {
  onpaint: ((this: HTMLCanvasElement, ev: PaintEvent) => unknown) | null
  requestPaint: () => void
  getElementTransform: (element: Element, drawTransform: DOMMatrix) => DOMMatrix
}

export type HtmlInCanvasElement = HTMLCanvasElement & HtmlInCanvas

export interface PaintEvent extends Event {
  readonly changedElements: ReadonlyArray<Element>
}

export type GPUCopyElementImageDestination = {
  destination: { texture: GPUTexture }
  width?: number
  height?: number
}

export type GPUCopyElementImageSource = {
  source: Element
  sx?: number
  sy?: number
  swidth?: number
  sheight?: number
}

export type GPUDrawElementImageSource = {
  source: Element
  sourceX?: number
  sourceY?: number
  sourceWidth?: number
  sourceHeight?: number
}

export type GPUDrawElementImageDestination = {
  texture: GPUTexture
  size: { width: number; height: number }
}

export type HtmlInCanvasQueue = GPUQueue & {
  drawElementImageToTexture?: (
    source: GPUDrawElementImageSource,
    destination: GPUDrawElementImageDestination,
  ) => void
  copyElementImageToTexture?: (
    source: GPUCopyElementImageSource,
    destination: GPUCopyElementImageDestination,
  ) => void
}

export type MousePosition = {
  x: number
  y: number
  down: boolean
}

export type GpuState = {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
}

export interface CustomEffectState {
  gpu: GpuState
  input: GPUTexture | null
  output: GPUTexture | null
  readonly time: number
  readonly deltaTime: number
  readonly frame: number
  readonly mousePosition: MousePosition
  readonly renderScale: number
  params: Record<string, unknown>
  state: Record<string, unknown>
}

export interface ShaderData {
  shader: Shader
  state: Record<string, unknown>
}

export type Manifest = {
  version: number
  isAnimated: boolean
  usesMouse: boolean
  name: string
}

export type Shader = {
  setup: (device: GPUDevice, frame: CustomEffectState) => void
  render: (device: GPUDevice, frame: CustomEffectState) => void
  params: Record<string, unknown>
  manifest?: Manifest
}
