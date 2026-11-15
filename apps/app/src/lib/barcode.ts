// The barcode reader, loaded only when someone opens the scanner (about 1 MB of WebAssembly).
// barcode-detector's ponyfill reads codes with ZXing on every phone, including iPhones, whose
// browser has no built-in barcode reader. Its .wasm file is served from our own site (bundled
// by Vite) rather than a public CDN: the Content-Security-Policy allows only our own origin,
// and scanning keeps working on poor signal once loaded.
//
// Keep zxing-wasm pinned to the exact version barcode-detector depends on (package.json): the
// reader checks the file it loads against the version it was built for.
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? wasmUrl : prefix + path,
  },
})

/** Barcodes printed on food packs. */
const PRODUCT_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

export function createDetector() {
  return new BarcodeDetector({ formats: [...PRODUCT_FORMATS] })
}
