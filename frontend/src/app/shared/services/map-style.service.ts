import { Injectable, inject, signal } from '@angular/core';
import { StyleSpecification } from 'maplibre-gl';
import { ThemeService } from './theme.service';

export type MapStyleType = 'streets' | 'satellite' | 'hybrid' | 'terrain';

export interface MapStyle {
  id: MapStyleType;
  name: string;
  description: string;
  style: StyleSpecification | string;
  preview?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MapStyleService {
  private readonly themeService = inject(ThemeService);
  
  // Current active style
  private readonly _currentStyleType = signal<MapStyleType>('streets');
  readonly currentStyleType = this._currentStyleType.asReadonly();

  // Available map styles
  private readonly mapStyles: Record<MapStyleType, MapStyle> = {
    streets: {
      id: 'streets',
      name: 'Calles',
      description: 'Vista de calles estándar',
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
    },
    satellite: {
      id: 'satellite',
      name: 'Satélite',
      description: 'Imágenes satelitales de alta resolución',
      style: {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: [
              'https://mt0.google.com/vt/lyrs=s&hl=es&x={x}&y={y}&z={z}',
              'https://mt1.google.com/vt/lyrs=s&hl=es&x={x}&y={y}&z={z}',
              'https://mt2.google.com/vt/lyrs=s&hl=es&x={x}&y={y}&z={z}',
              'https://mt3.google.com/vt/lyrs=s&hl=es&x={x}&y={y}&z={z}'
            ],
            tileSize: 256,
            attribution: '© Google'
          }
        },
        layers: [
          {
            id: 'satellite',
            type: 'raster',
            source: 'satellite'
          }
        ]
      }
    },
    hybrid: {
      id: 'hybrid',
      name: 'Híbrido',
      description: 'Satélite con etiquetas de calles',
      style: {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: [
              'https://mt0.google.com/vt/lyrs=y&hl=es&x={x}&y={y}&z={z}',
              'https://mt1.google.com/vt/lyrs=y&hl=es&x={x}&y={y}&z={z}',
              'https://mt2.google.com/vt/lyrs=y&hl=es&x={x}&y={y}&z={z}',
              'https://mt3.google.com/vt/lyrs=y&hl=es&x={x}&y={y}&z={z}'
            ],
            tileSize: 256,
            attribution: '© Google'
          }
        },
        layers: [
          {
            id: 'satellite-hybrid',
            type: 'raster',
            source: 'satellite'
          }
        ]
      }
    },
    terrain: {
      id: 'terrain',
      name: 'Terreno',
      description: 'Vista topográfica con relieve',
      style: {
        version: 8,
        sources: {
          terrain: {
            type: 'raster',
            tiles: [
              'https://mt0.google.com/vt/lyrs=p&hl=es&x={x}&y={y}&z={z}',
              'https://mt1.google.com/vt/lyrs=p&hl=es&x={x}&y={y}&z={z}',
              'https://mt2.google.com/vt/lyrs=p&hl=es&x={x}&y={y}&z={z}',
              'https://mt3.google.com/vt/lyrs=p&hl=es&x={x}&y={y}&z={z}'
            ],
            tileSize: 256,
            attribution: '© Google'
          }
        },
        layers: [
          {
            id: 'terrain',
            type: 'raster',
            source: 'terrain'
          }
        ]
      }
    }
  };

  // CARTO styles for streets (with dark mode)
  private readonly cartoStyles = {
    light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
  };

  getCurrentStyle(): StyleSpecification | string {
    const currentType = this._currentStyleType();
    
    // For streets, use CARTO with theme support
    if (currentType === 'streets') {
      const isDark = this.themeService.isDark();
      return isDark ? this.cartoStyles.dark : this.cartoStyles.light;
    }
    
    // For satellite/hybrid/terrain, return the specific style
    return this.mapStyles[currentType].style;
  }

  setStyleType(styleType: MapStyleType): void {
    this._currentStyleType.set(styleType);
  }

  getAvailableStyles(): MapStyle[] {
    return Object.values(this.mapStyles);
  }

  getStyleById(id: MapStyleType): MapStyle | undefined {
    return this.mapStyles[id];
  }

  getStyleForTheme(isDark: boolean): StyleSpecification | string {
    const currentType = this._currentStyleType();
    
    if (currentType === 'streets') {
      return isDark ? this.cartoStyles.dark : this.cartoStyles.light;
    }
    
    return this.mapStyles[currentType].style;
  }
}