# MMU FleetRadar 3D — MapLibre / Mapbox 3D Geospatial Engine Integration

**Document Version:** 1.0.0-PROD  
**Rendering Engine:** MapLibre GL JS (v4.x) / Mapbox GL JS Compatible  
**Target Viewports:** 60 FPS Mobile Touch & High-DPI Desktop Dashboards  

---

## 1. 3D Architectural Extrusions (`fill-extrusion`)

To deliver an immersive campus environment matching Google Earth / Apple Maps 3D, the application injects a dynamic vector extrusion layer over OpenStreetMap / custom vector tiles.

### 1.1 Campus Structural Polygons & Height Specifications
In MMU Mullana (`30.25045° N, 77.04505° E`), prominent institutional complexes are rendered with realistic volumetric extrusions:

| Landmark / Block | Base Elevation | Extrusion Height (`height`) | Color Palette | Description |
| :--- | :--- | :--- | :--- | :--- |
| MM Institute of Medical Sciences (Hospital 36) | 0m | 28m (7 Stories) | `#334155` / `#0284C7` | Multi-wing clinical hospital tower |
| Super-Specialty Hospital (Block 34) | 0m | 24m (6 Stories) | `#1E293B` / `#38BDF8` | Modern glazed medical pavilion |
| University Administrative Block (Block 39) | 0m | 18m (4 Stories) | `#E21E26` / `#CBD5E1` | Red institutional accented tower |
| MMEC Engineering Block 1 & 2 (Blocks 10, 14) | 0m | 20m (5 Stories) | `#475569` / `#94A3B8` | Interconnected engineering quad |
| Central University Auditorium (Block 53) | 0m | 15m (Dome/Atrium) | `#F59E0B` / `#78350F` | Large circular tiered hall |
| Boys Hostels Complex (BH 1, 5, 10) | 0m | 22m (6 Stories) | `#3B82F6` / `#1E3A8A` | High-density residential towers |
| Girls Hostels Complex (GH 3, 4, 6, 8) | 0m | 22m (6 Stories) | `#8B5CF6` / `#4C1D95` | Multi-block secure courtyard |
| MMU Cricket Stadium & Sports Pavilion | 0m | 8m | `#10B981` / `#065F46` | Tiered stadium seating and ground |

### 1.2 MapLibre GL 3D Layer Declaration
```javascript
map.on('style.load', () => {
  // 1. Insert 3D Building Extrusion Layer beneath labels
  const layers = map.getStyle().layers;
  const labelLayerId = layers.find(layer => layer.type === 'symbol' && layer.layout && layer.layout['text-field'])?.id;

  map.addLayer({
    'id': 'mmu-3d-buildings',
    'source': 'composite',
    'source-layer': 'building',
    'filter': ['==', 'extrude', 'true'],
    'type': 'fill-extrusion',
    'minzoom': 14,
    'paint': {
      'fill-extrusion-color': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        '#E21E26',
        ['interpolate', ['linear'], ['get', 'height'],
          0, '#1E293B',
          15, '#334155',
          25, '#475569',
          35, '#0D1B3E'
        ]
      ],
      'fill-extrusion-height': [
        'interpolate', ['linear'], ['zoom'],
        14, 0,
        15.05, ['get', 'height']
      ],
      'fill-extrusion-base': [
        'interpolate', ['linear'], ['zoom'],
        14, 0,
        15.05, ['get', 'min_height']
      ],
      'fill-extrusion-opacity': 0.88,
      'fill-extrusion-vertical-gradient': true
    }
  }, labelLayerId);

  // 2. Solar Lighting Configuration (Ambala Latitude 30.25° Solar Angle)
  map.setLight({
    'anchor': 'viewport',
    'color': '#FFE8D6',
    'intensity': 0.45,
    'position': [1.15, 210, 30] // Polar coordinates: [radial distance, azimuthal angle, polar angle]
  });
});
```

---

## 2. Dynamic Camera Trajectory & Heading Tracking

### 2.1 Dynamic Tilt & Heading-Locked Trajectory
When a user selects "Track My Bus" (Student View) or enters "Cockpit Mode" (Driver View):
1. **Pitch Dynamic:** Transitions from 0° (flat overhead) to 55° (3D perspective tilt) over 1200ms using `easeTo`.
2. **Bearing Synchronization:** The camera smoothly aligns with the bus's GPS bearing:
   ```typescript
   function syncCameraWithBus(map: maplibregl.Map, busCoords: [number, number], bearing: number, speedKmh: number) {
     // Dynamic zoom based on speed
     const targetZoom = speedKmh > 50 ? 15.0 : speedKmh > 20 ? 16.2 : 17.6;
     
     map.easeTo({
       center: busCoords,
       bearing: bearing,
       pitch: 55,
       zoom: targetZoom,
       duration: 900,
       easing: (t) => t * (2 - t) // Quadratic ease-out
     });
   }
   ```

---

## 3. High-Precision 60 FPS Coordinate Lerp & Slerp Pipeline

GPS samples arrive at 1-2 Hz. Rendering raw coordinates results in a 1-second jittery hop. The system implements a client-side linear coordinate interpolator and spherical bearing normalizer:

```typescript
export class VehicleInterpolationEngine {
  private prevLngLat: [number, number];
  private nextLngLat: [number, number];
  private prevBearing: number;
  private nextBearing: number;
  private lastUpdateTimestamp: number;
  private durationMs: number = 1000;
  private animationFrameId: number | null = null;
  private onStep: (pos: [number, number], bearing: number) => void;

  constructor(initialLngLat: [number, number], initialBearing: number, onStep: (pos: [number, number], bearing: number) => void) {
    this.prevLngLat = [...initialLngLat];
    this.nextLngLat = [...initialLngLat];
    this.prevBearing = initialBearing;
    this.nextBearing = initialBearing;
    this.lastUpdateTimestamp = performance.now();
    this.onStep = onStep;
  }

  public pushTelemetry(lngLat: [number, number], bearing: number) {
    this.prevLngLat = this.calculateCurrent(performance.now()).pos;
    this.nextLngLat = lngLat;
    this.prevBearing = this.calculateCurrent(performance.now()).bearing;
    this.nextBearing = bearing;
    this.lastUpdateTimestamp = performance.now();
    
    if (!this.animationFrameId) {
      this.loop();
    }
  }

  private calculateCurrent(now: number) {
    const elapsed = now - this.lastUpdateTimestamp;
    const t = Math.min(1.0, elapsed / this.durationMs);

    // Linear interpolate position
    const lng = this.prevLngLat[0] + (this.nextLngLat[0] - this.prevLngLat[0]) * t;
    const lat = this.prevLngLat[1] + (this.nextLngLat[1] - this.prevLngLat[1]) * t;

    // Shortest angular distance for bearing
    let diff = (this.nextBearing - this.prevBearing + 180) % 360 - 180;
    if (diff < -180) diff += 360;
    const bearing = (this.prevBearing + diff * t + 360) % 360;

    return { pos: [lng, lat] as [number, number], bearing, progress: t };
  }

  private loop = () => {
    const { pos, bearing, progress } = this.calculateCurrent(performance.now());
    this.onStep(pos, bearing);

    if (progress < 1.0) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    } else {
      this.animationFrameId = null;
    }
  };

  public destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
```

---

## 4. 3D Bus Marker & Route Polyline Glow Effects

### 4.1 Route Line Shader Styling
Active transit corridors are displayed with a multi-layered neon glow line:
- **Base Route Trace:** Dark slate path (`#334155`, width: 8px, opacity: 0.7).
- **Active Bus Corridor:** MMU Crimson glow (`#E21E26`, width: 4.5px, opacity: 0.95).
- **Passed Path / Completed:** Emerald green dimmed trace (`#10B981`, width: 4px).

### 4.2 Interactive 3D Marker Elements
- Custom HTML/SVG Bus Marker with:
  - Real-time rotating chassis arrow pointing to `bearing`.
  - Pulsing radar concentric wave rings (`ping-animation`) indicating live GPS broadcast heartbeat.
  - Live speed HUD badge hovering over bus roof (`42 km/h`).
  - Stoppage markers with sequence badges, student pickup count chips, and 1km geofence dotted boundaries.
