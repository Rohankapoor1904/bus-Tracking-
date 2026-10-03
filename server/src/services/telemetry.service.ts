import { db } from '../db/database.js';
import { redis } from '../db/redis.js';
import { TelemetryPoint, WSOutboundMessage, RouteStop } from '../types/index.js';
import {
  calculateDistanceMeters,
  calculateETA,
} from '../db/spatial-engine.js';
import { config } from '../config/index.js';

type BroadcastFn = (channel: string, message: WSOutboundMessage) => void;

export class TelemetryService {
  private static broadcast: BroadcastFn | null = null;
  // Track triggered geofence alerts per trip to prevent spamming
  private static geofenceAlertsSent: Set<string> = new Set();

  public static setBroadcaster(fn: BroadcastFn) {
    this.broadcast = fn;
  }

  public static async processTelemetry(point: TelemetryPoint) {
    // 1. Persist telemetry point in PostgreSQL
    await db.saveTelemetryPoint(point);

    // 2. Fetch active trip and route
    const trip = await db.getActiveTripByBusId(point.busId);
    const bus = await db.getBusById(point.busId);
    const route = point.routeId ? await db.getRouteById(point.routeId) : null;

    let nextStop: RouteStop | null = null;
    let minDistanceMeters = Infinity;
    let etaMinutes = 0;

    if (route && route.stops.length > 0) {
      for (const stop of route.stops) {
        const dist = calculateDistanceMeters(
          point.latitude,
          point.longitude,
          stop.latitude,
          stop.longitude
        );

        if (dist < minDistanceMeters) {
          minDistanceMeters = dist;
          nextStop = stop;
        }

        // 3. Geofence evaluation (< 1000m)
        if (dist <= config.geofenceRadiusMeters) {
          const alertKey = `${point.tripId}_stop_${stop.id}`;
          if (!this.geofenceAlertsSent.has(alertKey)) {
            this.geofenceAlertsSent.add(alertKey);

            const stopEta = calculateETA(dist, point.speedKmh);
            const geofenceAlert: WSOutboundMessage = {
              event: 'GEOFENCE_APPROACHING_ALERT',
              timestamp: new Date().toISOString(),
              data: {
                busId: point.busId,
                busNumber: bus?.busNumber || 'BUS',
                routeId: route.id,
                stopId: stop.id,
                stopName: stop.name,
                distanceMeters: Math.round(dist),
                etaMinutes: stopEta,
                message: `Bus ${bus?.busNumber} is within ${(dist / 1000).toFixed(1)} km of ${stop.name}. Estimated arrival: ~${stopEta} min.`,
              },
            };

            if (this.broadcast) {
              this.broadcast(`route:${route.id}`, geofenceAlert);
              this.broadcast('admin:radar', geofenceAlert);
            }
          }
        }
      }

      if (nextStop) {
        etaMinutes = calculateETA(minDistanceMeters, point.speedKmh);
        if (trip) {
          await db.updateTripSession(trip.id, {
            nextStopName: nextStop.name,
            currentStopSequence: nextStop.stopSequence,
            distanceToNextStopMeters: Math.round(minDistanceMeters),
            etaMinutesToNextStop: etaMinutes,
          });
        }
      }
    }

    // 4. Construct live position packet
    const positionUpdate: WSOutboundMessage = {
      event: 'BUS_POSITION_UPDATE',
      timestamp: new Date().toISOString(),
      data: {
        busId: point.busId,
        busNumber: bus?.busNumber || point.busNumber || 'BUS',
        routeId: point.routeId || route?.id || null,
        routeName: route?.name || 'MMU Transit Line',
        latitude: point.latitude,
        longitude: point.longitude,
        speedKmh: point.speedKmh,
        bearing: point.bearing,
        altitudeM: point.altitudeM,
        accuracyM: point.accuracyM,
        batteryPercent: point.batteryPercent || 90,
        recordedAt: point.recordedAt,
        nextStopName: nextStop?.name || 'Campus Terminal',
        distanceToNextStopMeters: Math.round(minDistanceMeters),
        etaMinutesUpcomingStop: etaMinutes,
        capacity: bus?.capacity || 42,
        boardedCount: trip?.totalPassengersBoarded || 0,
      },
    };

    // 5. Cache latest position + broadcast to route channel and Admin Fleet Radar
    await redis.setLatestPosition(point.busId, positionUpdate.data);
    if (this.broadcast) {
      if (point.routeId) {
        this.broadcast(`route:${point.routeId}`, positionUpdate);
      }
      this.broadcast('admin:radar', positionUpdate);
    }

    return positionUpdate;
  }

  public static async triggerEmergencySOS(
    busId: string,
    driverId: string,
    latitude: number | undefined,
    longitude: number | undefined,
    message: string
  ) {
    const bus = await db.getBusById(busId);
    const trip = await db.getActiveTripByBusId(busId);

    // If the SOS packet carried no fix, fall back to the bus's last authentic
    // telemetry — never a hardcoded campus coordinate.
    let lat = latitude;
    let lng = longitude;
    if (lat === undefined || lng === undefined) {
      const last = await db.getLatestTelemetry(busId);
      if (last) {
        lat = last.latitude;
        lng = last.longitude;
      }
    }

    const alert = await db.createFleetAlert({
      busId,
      busNumber: bus?.busNumber || 'BUS',
      tripId: trip?.id,
      alertType: 'SOS_EMERGENCY',
      severity: 'CRITICAL',
      message: `CRITICAL SOS: ${message} (Driver: ${bus?.assignedDriverName || 'Driver'})`,
      latitude: lat,
      longitude: lng,
    });

    const emergencyMsg: WSOutboundMessage = {
      event: 'EMERGENCY_ALERT',
      timestamp: new Date().toISOString(),
      data: alert,
    };

    if (this.broadcast) {
      this.broadcast('admin:radar', emergencyMsg);
      if (bus?.defaultRouteId) {
        this.broadcast(`route:${bus.defaultRouteId}`, emergencyMsg);
      }
    }

    return alert;
  }
}
