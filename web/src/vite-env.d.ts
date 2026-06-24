/// <reference types="vite/client" />

// mammoth ships types for its main entry but not the lighter browser bundle.
declare module 'mammoth/mammoth.browser' {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>
  const _default: { extractRawText: typeof extractRawText }
  export default _default
}
