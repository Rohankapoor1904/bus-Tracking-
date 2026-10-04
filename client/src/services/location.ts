import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export interface DeviceFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speedMps: number | null;
}

/**
 * Single location pipeline for the whole app (driver telemetry, student/driver
 * "ME" puck, Locate-Me button).
 *
 * Why this exists: raw `navigator.geolocation` fails in two common field
 * situations with ZERO user feedback —
 *  1. Native APK: manifest permission alone is not enough, a runtime prompt
 *     must be granted or every watch dies with PERMISSION_DENIED.
 *  2. HTTP dev hosts / insecure contexts: the browser geolocation API is
 *     blocked entirely ("Only secure origins are allowed").
 * The Capacitor Geolocation plugin talks to the native LocationManager on
 * device (works regardless of origin) and falls back to the browser API on web.
 */

export async function ensureLocationPermission(): Promise<{ granted: boolean; message?: string }> {
  try {
    const status = await Geolocation.checkPermissions().catch(() => null);
    const loc = (status as any)?.location as string | undefined;
    const coarse = (status as any)?.coarseLocation as string | undefined;
    if (loc === 'granted' || coarse === 'granted') return { granted: true };
    const req = await Geolocation.requestPermissions().catch((e: any) => {
      throw e;
    });
    const rloc = (req as any)?.location as string | undefined;
    const rcoarse = (req as any)?.coarseLocation as string | undefined;
    if (rloc === 'granted' || rcoarse === 'granted') return { granted: true };
    return {
      granted: false,
      message:
        'Location permission denied — phone Settings → Apps → MMU FleetRadar → Permissions → Location → Allow (While using the app), phir Retry dabayein.',
    };
  } catch (e: any) {
    // Web fallback: permissions API is best-effort; the actual getCurrentPosition
    // call below will surface the real error.
    return { granted: true };
  }
}

function toFix(lat: number, lng: number, acc: number, heading: any, speed: any): DeviceFix {
  return {
    latitude: lat,
    longitude: lng,
    accuracy: acc ?? 10,
    heading: typeof heading === 'number' ? heading : null,
    speedMps: typeof speed === 'number' ? speed : null,
  };
}

async function getIpLocation(): Promise<DeviceFix | null> {
  const providers = ['https://ipwho.is/', 'https://freeipapi.com/api/json'];
  for (const url of providers) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      const data = await res.json();
      const lat = data.latitude ?? data.lat;
      const lng = data.longitude ?? data.lon ?? data.lng;
      if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0) {
        return toFix(lat, lng, 2000, null, null);
      }
    } catch {
      // try next provider
    }
  }
  return null;
}

/** One-shot fix with multi-tier fallback (GPS -> Network/Wi-Fi -> IP location). */
export async function getDeviceFix(timeoutMs = 15000): Promise<DeviceFix> {
  // Native path first — works inside the APK even on insecure (http) origins.
  if (Capacitor.isNativePlatform()) {
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: Math.min(timeoutMs, 8000),
        maximumAge: 10000,
      });
      return toFix(
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.accuracy,
        (pos.coords as any).heading,
        (pos.coords as any).speed
      );
    } catch {
      // Coarse / network Wi-Fi location fallback
      try {
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 6000,
          maximumAge: 30000,
        });
        return toFix(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          (pos.coords as any).heading,
          (pos.coords as any).speed
        );
      } catch {
        // IP geolocation fallback when GPS/Network provider unavailable
        const ipFix = await getIpLocation();
        if (ipFix) return ipFix;
        throw Object.assign(new Error('Location nahi mili. GPS ya internet check karein.'), { code: 2 });
      }
    }
  }

  // Web path
  if (!('geolocation' in navigator) || !window.isSecureContext) {
    const ipFix = await getIpLocation();
    if (ipFix) return ipFix;
    throw Object.assign(new Error('Is browser me location support nahi hai.'), { code: 0 });
  }

  return new Promise<DeviceFix>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve(
          toFix(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.coords.heading, p.coords.speed)
        ),
      async () => {
        // Try without high accuracy (Wi-Fi triangulation)
        navigator.geolocation.getCurrentPosition(
          (p) =>
            resolve(
              toFix(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.coords.heading, p.coords.speed)
            ),
          async (err) => {
            const ipFix = await getIpLocation();
            if (ipFix) return resolve(ipFix);
            reject(err);
          },
          { enableHighAccuracy: false, timeout: 6000, maximumAge: 30000 }
        );
      },
      { enableHighAccuracy: true, timeout: Math.min(timeoutMs, 8000), maximumAge: 10000 }
    );
  });
}

export type FixCallback = (fix: DeviceFix) => void;
export type FixErrorCallback = (err: { code: number; message: string }) => void;

/**
 * Continuous tracking. Resolves to an unsubscribe fn.
 * On native uses the Capacitor plugin, on web the browser watch.
 */
export async function watchDeviceFix(
  onFix: FixCallback,
  onError?: FixErrorCallback
): Promise<() => void> {
  // Proactively fetch an initial fix to avoid waiting for the first watch callback
  getDeviceFix(10000).then(onFix).catch(() => undefined);

  if (Capacitor.isNativePlatform()) {
    try {
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
        (pos, err) => {
          if (err) {
            // Try coarse fix on watch error
            getDeviceFix(6000).then(onFix).catch(() => {
              onError?.({ code: (err as any)?.code ?? 2, message: (err as any)?.message ?? String(err) });
            });
            return;
          }
          if (!pos) return;
          onFix(
            toFix(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.accuracy,
              (pos.coords as any).heading,
              (pos.coords as any).speed
            )
          );
        }
      );
      return () => {
        Geolocation.clearWatch({ id }).catch(() => undefined);
      };
    } catch (e: any) {
      onError?.({ code: 1, message: e?.message ?? 'Native location watch failed' });
      return () => undefined;
    }
  }
  if (!('geolocation' in navigator)) {
    onError?.({ code: 0, message: 'Is browser me location support nahi hai.' });
    return () => undefined;
  }
  const id = navigator.geolocation.watchPosition(
    (p) =>
      onFix(toFix(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.coords.heading, p.coords.speed)),
    (err) => onError?.({ code: err.code, message: err.message }),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}
