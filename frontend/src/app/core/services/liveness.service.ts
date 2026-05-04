import { Injectable } from '@angular/core';

export interface LivenessResult {
  isLive: boolean;
  variance: number; // 0-255 scale
  framesAnalyzed: number;
}

/**
 * Client-side liveness detection via inter-frame pixel variance analysis.
 *
 * A static photo or screen capture produces near-zero variance between frames
 * captured at 250ms intervals. A live face produces natural micro-variation
 * from blinking, breathing, and micro-movements.
 *
 * This is a FIRST-LINE defense. Server-side embedding variance is the definitive check.
 */
@Injectable({ providedIn: 'root' })
export class LivenessService {
  /**
   * Analyze liveness from multiple base64 JPEG frames.
   * Requires at least 2 frames. Analyzes the central 50% region where the face should be.
   *
   * Threshold 8.0: calibrated for 250ms interval captures.
   * - Static photo/screen: typically < 3.0 variance
   * - Live face: typically > 8.0 variance
   */
  async analyzeLiveness(
    frames: string[],
    varianceThreshold = 8.0
  ): Promise<LivenessResult> {
    if (frames.length < 2) {
      return { isLive: false, variance: 0, framesAnalyzed: frames.length };
    }

    try {
      const imageDataList = await Promise.all(
        frames.map((f) => this.frameToImageData(f))
      );

      let maxVariance = 0;

      // Compare each pair of frames
      for (let i = 0; i < imageDataList.length; i++) {
        for (let j = i + 1; j < imageDataList.length; j++) {
          const v = this.computeCentralVariance(
            imageDataList[i],
            imageDataList[j]
          );
          if (v > maxVariance) maxVariance = v;
        }
      }

      return {
        isLive: maxVariance >= varianceThreshold,
        variance: maxVariance,
        framesAnalyzed: frames.length,
      };
    } catch {
      // If analysis fails, fail open (don't block the user) but flag it
      return { isLive: true, variance: -1, framesAnalyzed: frames.length };
    }
  }

  /**
   * Compute mean absolute difference in the central 50%x50% region of two ImageData.
   * Uses only luminance (grayscale) to avoid color artifacts.
   */
  private computeCentralVariance(a: ImageData, b: ImageData): number {
    const w = a.width;
    const h = a.height;

    // Central 50% region
    const x0 = Math.floor(w * 0.25);
    const x1 = Math.floor(w * 0.75);
    const y0 = Math.floor(h * 0.25);
    const y1 = Math.floor(h * 0.75);

    let totalDiff = 0;
    let pixelCount = 0;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * w + x) * 4;
        // Luminance: 0.299R + 0.587G + 0.114B
        const lumA =
          0.299 * a.data[idx] +
          0.587 * a.data[idx + 1] +
          0.114 * a.data[idx + 2];
        const lumB =
          0.299 * b.data[idx] +
          0.587 * b.data[idx + 1] +
          0.114 * b.data[idx + 2];
        totalDiff += Math.abs(lumA - lumB);
        pixelCount++;
      }
    }

    return pixelCount > 0 ? totalDiff / pixelCount : 0;
  }

  /**
   * Decode a base64 JPEG string into ImageData using an offscreen canvas.
   */
  private frameToImageData(base64: string): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Downsample to 160x120 for performance
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, 160, 120);
        resolve(ctx.getImageData(0, 0, 160, 120));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = base64;
    });
  }
}
