import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { MMU_CAMPUS_BUILDINGS } from '../db/spatial-engine.js';

export const routesRouter = Router();

routesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const campus = req.query.campus as string | undefined;
    const routes = await db.getAllRoutes(campus);
    res.status(200).json({ success: true, data: routes });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

routesRouter.get('/campus-buildings', async (_req: Request, res: Response): Promise<void> => {
  try {
    // GeoJSON FeatureCollection of 3D MMU campus buildings
    const features = MMU_CAMPUS_BUILDINGS.map((b) => ({
      type: 'Feature',
      properties: {
        id: b.id,
        name: b.name,
        blockCode: b.blockCode,
        height: b.heightMeters,
        min_height: b.minHeightMeters,
        color: b.colorHex,
        campus: b.campus,
      },
      geometry: {
        type: 'Polygon',
        coordinates: b.coordinates,
      },
    }));

    res.status(200).json({
      type: 'FeatureCollection',
      features,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

routesRouter.get('/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const route = await db.getRouteById(req.params.id);
    if (!route) {
      res.status(404).json({ success: false, error: 'Route not found' });
      return;
    }
    res.status(200).json({ success: true, data: route });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

routesRouter.get('/:id/stops', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const route = await db.getRouteById(req.params.id);
    if (!route) {
      res.status(404).json({ success: false, error: 'Route not found' });
      return;
    }
    res.status(200).json({ success: true, data: route.stops });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
