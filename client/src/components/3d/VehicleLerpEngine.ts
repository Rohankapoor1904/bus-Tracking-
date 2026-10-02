/**
 * MMU High-Precision 60 FPS Vehicle Lerp & Bearing Slerp Engine.
 *
 * Consumes ONLY authentic driver telemetry packets
 * (navigator.geolocation.watchPosition -> TELEMETRY_PING -> WS broadcast).
 * There is deliberately NO timer-driven demo movement here: when no live
 * packets arrive the marker simply stays parked at its last known fix.
 *
 * - Linear coordinate interpolation (lerp) with ease-out cubic damping.
 * - Shortest-arc bearing interpolation (compass slerp equivalent).
 * - requestAnimationFrame loop; idle (no frames) when target reached.
 */

export class VehicleLerpEngine {
  private startLngLat: [number, number];
  private targetLngLat: [number, number];
  private startBearing: number;
  private targetBearing: number;
  private startTime: number;
  private durationMs: number;
  private animationFrameId: number | null = null;
  private onStep: (coords: [number, number], bearing: number) => void;

  constructor(
    initialCoords: [number, number],
    initialBearing: number,
    onStep: (coords: [number, number], bearing: number) => void,
    durationMs = 1200
  ) {
    this.startLngLat = [...initialCoords] as [number, number];
    this.targetLngLat = [...initialCoords] as [number, number];
    this.startBearing = initialBearing;
    this.targetBearing = initialBearing;
    this.startTime = performance.now();
    this.durationMs = durationMs;
    this.onStep = onStep;
  }

  public updateTarget(coords: [number, number], bearing: number, durationMs = 1200) {
    const now = performance.now();
    const sampled = this.sample(now);
    this.startLngLat = sampled.coords;
    this.startBearing = sampled.bearing;
    this.targetLngLat = [...coords] as [number, number];
    this.targetBearing = bearing;
    // Clamp smoothing window: snappy on highway, stable at depot
    this.durationMs = Math.min(2000, Math.max(400, durationMs));
    this.startTime = now;
    if (this.animationFrameId === null) this.loop();
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  private shortestArc(from: number, to: number): number {
    let diff = ((to - from + 540) % 360) - 180;
    if (diff < -180) diff += 360;
    return diff;
  }

  private sample(now: number): { coords: [number, number]; bearing: number; progress: number } {
    const raw = Math.min(1, Math.max(0, (now - this.startTime) / this.durationMs));
    const t = this.easeOutCubic(raw);
    const lng = this.startLngLat[0] + (this.targetLngLat[0] - this.startLngLat[0]) * t;
    const lat = this.startLngLat[1] + (this.targetLngLat[1] - this.startLngLat[1]) * t;
    const bearing = (this.startBearing + this.shortestArc(this.startBearing, this.targetBearing) * t + 360) % 360;
    return { coords: [lng, lat], bearing, progress: raw };
  }

  private loop = () => {
    const now = performance.now();
    const { coords, bearing, progress } = this.sample(now);
    this.onStep(coords, bearing);
    if (progress < 1) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    } else {
      this.animationFrameId = null;
    }
  };

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
