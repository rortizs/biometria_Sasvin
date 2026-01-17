import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  AfterViewInit,
  inject,
  input,
  output,
  effect,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Map as MapLibreMap, MapOptions, LngLatLike, MapEventType } from 'maplibre-gl';
import { ThemeService } from '../../services/theme.service';
import { MapStyleService } from '../../services/map-style.service';

export interface MapClickEvent {
  lngLat: { lng: number; lat: number };
  point: { x: number; y: number };
  originalEvent: MouseEvent;
}

export interface MapBounds {
  sw: [number, number];
  ne: [number, number];
}

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-container" [class]="containerClass()">
      <div 
        #mapContainer 
        class="map-element"
        [style.width]="width()"
        [style.height]="height()"
      ></div>
      
      <!-- Slot for child components -->
      <ng-content></ng-content>
      
      <!-- Loading state -->
      @if (isLoading()) {
        <div class="map-loading">
          <div class="loading-spinner"></div>
          <span>Cargando mapa...</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .map-container {
      position: relative;
      overflow: hidden;
      border-radius: 0.5rem;
      background: rgb(243 244 246);
      transition: all 0.2s ease-in-out;
    }

    .dark .map-container {
      background: rgb(17 24 39);
    }

    .map-element {
      width: 100%;
      height: 100%;
    }

    .map-loading {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.9);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      font-size: 0.875rem;
      color: rgb(107 114 128);
      z-index: 1000;
    }

    .dark .map-loading {
      background: rgba(17, 24, 39, 0.9);
      color: rgb(156 163 175);
    }

    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 2px solid rgb(229 231 235);
      border-top-color: rgb(59 130 246);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .dark .loading-spinner {
      border-color: rgb(55 65 81);
      border-top-color: rgb(59 130 246);
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* MapLibre GL CSS */
    :host ::ng-deep .maplibregl-map {
      border-radius: 0.5rem;
    }

    :host ::ng-deep .maplibregl-ctrl-group {
      background: white;
      border-radius: 0.375rem;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
      border: 1px solid rgb(229 231 235);
    }

    .dark :host ::ng-deep .maplibregl-ctrl-group {
      background: rgb(31 41 55);
      border-color: rgb(75 85 99);
      color: rgb(243 244 246);
    }

    :host ::ng-deep .maplibregl-ctrl button {
      background: transparent;
      border: none;
      cursor: pointer;
      display: block;
      outline: none;
      width: 30px;
      height: 30px;
    }

    :host ::ng-deep .maplibregl-ctrl button:hover {
      background: rgb(249 250 251);
    }

    .dark :host ::ng-deep .maplibregl-ctrl button:hover {
      background: rgb(55 65 81);
    }

    :host ::ng-deep .maplibregl-popup {
      z-index: 1001;
    }

    :host ::ng-deep .maplibregl-popup-content {
      background: white;
      border-radius: 0.5rem;
      box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
      border: 1px solid rgb(229 231 235);
      padding: 1rem;
      min-width: 200px;
    }

    .dark :host ::ng-deep .maplibregl-popup-content {
      background: rgb(31 41 55);
      border-color: rgb(75 85 99);
      color: rgb(243 244 246);
    }
  `],
  host: {
    '[class.dark]': 'themeService.isDark()'
  }
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private readonly themeService = inject(ThemeService);
  private readonly mapStyleService = inject(MapStyleService);

  // Inputs (Angular 18+ signal inputs)
  readonly center = input<LngLatLike>([-90.5069, 14.6349]); // Guatemala City default
  readonly zoom = input<number>(12);
  readonly width = input<string>('100%');
  readonly height = input<string>('400px');
  readonly containerClass = input<string>('');
  readonly interactive = input<boolean>(true);
  readonly attributionControl = input<boolean>(false);
  readonly maxBounds = input<MapBounds | null>(null);
  readonly minZoom = input<number>(0);
  readonly maxZoom = input<number>(24);

  // Outputs
  readonly mapClick = output<MapClickEvent>();
  readonly mapLoad = output<MapLibreMap>();
  readonly mapMove = output<{ center: LngLatLike; zoom: number; bearing: number; pitch: number }>();

  // State
  readonly isLoading = signal(true);
  
  private map: MapLibreMap | null = null;
  private resizeObserver?: ResizeObserver;

  constructor() {
    // Auto-update map style when theme changes
    effect(() => {
      if (this.map) {
        const newStyle = this.mapStyleService.getCurrentStyle();
        this.map.setStyle(newStyle);
      }
    });
  }

  ngOnInit(): void {
    // Component initialization
  }

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private async initializeMap(): Promise<void> {
    try {
      const mapOptions: Partial<MapOptions> = {
        container: this.mapContainer.nativeElement,
        style: this.mapStyleService.getCurrentStyle(),
        center: this.center(),
        zoom: this.zoom(),
        interactive: this.interactive(),
        minZoom: this.minZoom(),
        maxZoom: this.maxZoom()
      };

      // Handle attribution control separately to avoid type issues
      if (!this.attributionControl()) {
        mapOptions.attributionControl = false;
      }

      if (this.maxBounds()) {
        const bounds = this.maxBounds()!;
        mapOptions.maxBounds = [bounds.sw, bounds.ne];
      }

      this.map = new MapLibreMap(mapOptions as MapOptions);

      // Setup event listeners
      this.map.on('load', () => {
        this.isLoading.set(false);
        this.mapLoad.emit(this.map!);
      });

      this.map.on('click', (e) => {
        this.mapClick.emit({
          lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat },
          point: { x: e.point.x, y: e.point.y },
          originalEvent: e.originalEvent
        });
      });

      this.map.on('moveend', () => {
        if (!this.map) return;
        
        this.mapMove.emit({
          center: this.map.getCenter(),
          zoom: this.map.getZoom(),
          bearing: this.map.getBearing(),
          pitch: this.map.getPitch()
        });
      });

      // Handle container resize
      this.setupResizeObserver();

    } catch (error) {
      console.error('Error initializing map:', error);
      this.isLoading.set(false);
    }
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.map) {
          this.map.resize();
        }
      });
      this.resizeObserver.observe(this.mapContainer.nativeElement);
    }
  }

  // Public API methods
  getMap(): MapLibreMap | null {
    return this.map;
  }

  flyTo(center: LngLatLike, zoom?: number): void {
    if (this.map) {
      this.map.flyTo({
        center,
        zoom: zoom || this.map.getZoom(),
        essential: true
      });
    }
  }

  setCenter(center: LngLatLike): void {
    if (this.map) {
      this.map.setCenter(center);
    }
  }

  setZoom(zoom: number): void {
    if (this.map) {
      this.map.setZoom(zoom);
    }
  }

  fitBounds(bounds: MapBounds, options?: any): void {
    if (this.map) {
      this.map.fitBounds([bounds.sw, bounds.ne], {
        padding: 50,
        ...options
      });
    }
  }
}