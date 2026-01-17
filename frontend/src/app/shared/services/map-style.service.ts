import { Injectable, inject } from '@angular/core';
import { StyleSpecification } from 'maplibre-gl';
import { ThemeService } from './theme.service';

export interface MapStyleConfig {
  light: StyleSpecification | string;
  dark: StyleSpecification | string;
}

@Injectable({
  providedIn: 'root'
})
export class MapStyleService {
  private readonly themeService = inject(ThemeService);

  // CARTO styles - free and beautiful!
  private readonly cartoStyles: MapStyleConfig = {
    light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
  };

  // OpenStreetMap styles as fallback
  private readonly osmStyles: MapStyleConfig = {
    light: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'osm',
          type: 'raster',
          source: 'osm'
        }
      ]
    },
    dark: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© Stadia Maps © OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'osm',
          type: 'raster',
          source: 'osm'
        }
      ]
    }
  };

  getCurrentStyle(): StyleSpecification | string {
    const isDark = this.themeService.isDark();
    
    // Try CARTO first (more beautiful), fallback to OSM
    try {
      return isDark ? this.cartoStyles.dark : this.cartoStyles.light;
    } catch {
      return isDark ? this.osmStyles.dark : this.osmStyles.light;
    }
  }

  getStyleForTheme(isDark: boolean): StyleSpecification | string {
    try {
      return isDark ? this.cartoStyles.dark : this.cartoStyles.light;
    } catch {
      return isDark ? this.osmStyles.dark : this.osmStyles.light;
    }
  }

  // For custom providers
  setCustomStyles(config: MapStyleConfig): void {
    // Future implementation for custom map providers
    console.log('Custom styles not yet implemented:', config);
  }
}