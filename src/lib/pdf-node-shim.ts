import "server-only";

import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

let applied = false;

/**
 * pdf-parse → pdfjs-dist がモジュール評価時に DOMMatrix 等を参照する。
 * Next のサーバーバンドルでは pdfjs 内の createRequire 経由の polyfill が効かないことがあるため、
 * pdf-parse を import する前に一度だけ適用する。
 */
export function ensurePdfNodeDomGlobals(): void {
  if (applied) return;

  if (typeof globalThis.DOMMatrix === "undefined") {
    globalThis.DOMMatrix =
      DOMMatrix as unknown as typeof globalThis.DOMMatrix;
  }
  if (typeof globalThis.ImageData === "undefined") {
    globalThis.ImageData =
      ImageData as unknown as typeof globalThis.ImageData;
  }
  if (typeof globalThis.Path2D === "undefined") {
    globalThis.Path2D = Path2D as unknown as typeof globalThis.Path2D;
  }
  if (!globalThis.navigator?.language) {
    globalThis.navigator = {
      language: "ja-JP",
      platform: "",
      userAgent: "",
    } as Navigator;
  }

  applied = true;
}

ensurePdfNodeDomGlobals();
