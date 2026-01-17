import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  MapComponent, 
  MapControlsComponent, 
  MapMarkerComponent, 
  MapPopupComponent,
  type MapClickEvent,
  type MarkerClickEvent
} from '../../shared/components/map';

interface DemoLocation {
  id: string;
  name: string;
  position: [number, number];
  description: string;
}

@Component({
  selector: 'app-map-demo',
  standalone: true,
  imports: [
    CommonModule,
    MapComponent,
    MapControlsComponent,
    MapMarkerComponent,
    MapPopupComponent
  ],
  template: `
    <div class="demo-page">
      <header class="demo-header">
        <h1>🗺️ MapCN-Inspired Demo</h1>
        <p>MapLibre GL + Angular + Modern Design System</p>
      </header>

      <div class="demo-grid">
        <!-- Controls Panel -->
        <div class="controls-panel">
          <h3>Controles</h3>
          
          <div class="control-group">
            <h4>Ubicaciones de Demo</h4>
            @for (location of demoLocations; track location.id) {
              <button 
                class="location-btn"
                [class.active]="selectedLocation()?.id === location.id"
                (click)="flyToLocation(location)"
              >
                📍 {{ location.name }}
              </button>
            }
          </div>

          <div class="control-group">
            <h4>Eventos</h4>
            <div class="events-log">
              @for (event of recentEvents(); track $index) {
                <div class="event">{{ event }}</div>
              }
            </div>
          </div>
        </div>

        <!-- Map -->
        <div class="map-section">
          <app-map
            [center]="mapCenter()"
            [zoom]="mapZoom()"
            height="600px"
            containerClass="demo-map"
            (mapClick)="onMapClick($event)"
            (mapLoad)="onMapLoad()"
            (mapMove)="onMapMove($event)"
          >
            <!-- Controls overlay -->
            <app-map-controls 
              [navigation]="true"
              [scale]="true"
              [fullscreen]="true"
              [geolocate]="true"
            />

            <!-- Demo markers -->
            @for (location of demoLocations; track location.id) {
              <app-map-marker
                [position]="location.position"
                [color]="selectedLocation()?.id === location.id ? '#ef4444' : '#3b82f6'"
                size="large"
                [icon]="'🏢'"
                (markerClick)="onMarkerClick($event, location)"
              />
            }

            <!-- Show popup for selected location -->
            @if (selectedLocation() && showPopup()) {
              <app-map-popup
                [position]="selectedLocation()!.position"
                anchor="top"
                [closeButton]="true"
                (popupClose)="closePopup()"
                (popupOpen)="onPopupOpen()"
              >
                <div class="location-popup">
                  <h4>{{ selectedLocation()!.name }}</h4>
                  <p>{{ selectedLocation()!.description }}</p>
                  <div class="popup-actions">
                    <button class="btn-sm btn-primary" (click)="addEvent('Popup action clicked')">
                      Test Action
                    </button>
                  </div>
                </div>
              </app-map-popup>
            }

            <!-- Click marker -->
            @if (clickMarker()) {
              <app-map-marker
                [position]="clickMarker()!"
                color="#22c55e"
                size="medium"
                icon="📍"
              />
            }
          </app-map>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .demo-page {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .demo-header {
      text-align: center;
      margin-bottom: 2rem;
      color: white;
    }

    .demo-header h1 {
      font-size: 3rem;
      margin: 0 0 0.5rem 0;
      font-weight: 700;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }

    .demo-header p {
      font-size: 1.2rem;
      opacity: 0.9;
      margin: 0;
    }

    .demo-grid {
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: 2rem;
      height: 700px;
    }

    @media (max-width: 1024px) {
      .demo-grid {
        grid-template-columns: 1fr;
        height: auto;
      }
    }

    .controls-panel {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 1rem;
      padding: 1.5rem;
      box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
      border: 1px solid rgba(255, 255, 255, 0.18);
      height: fit-content;
    }

    .controls-panel h3 {
      margin: 0 0 1.5rem 0;
      color: #1f2937;
      font-size: 1.5rem;
      font-weight: 600;
    }

    .control-group {
      margin-bottom: 2rem;
    }

    .control-group h4 {
      margin: 0 0 1rem 0;
      color: #374151;
      font-size: 1.1rem;
      font-weight: 500;
    }

    .location-btn {
      display: block;
      width: 100%;
      text-align: left;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      margin-bottom: 0.5rem;
      cursor: pointer;
      transition: all 0.2s ease;
      color: #374151;
      font-weight: 500;
    }

    .location-btn:hover {
      background: #f3f4f6;
      border-color: #3b82f6;
      transform: translateY(-1px);
    }

    .location-btn.active {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }

    .events-log {
      max-height: 200px;
      overflow-y: auto;
      background: #f9fafb;
      border-radius: 0.5rem;
      padding: 1rem;
      border: 1px solid #e5e7eb;
    }

    .event {
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
      padding: 0.25rem;
      border-left: 3px solid #3b82f6;
      padding-left: 0.75rem;
    }

    .event:last-child {
      margin-bottom: 0;
    }

    .map-section {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 1rem;
      padding: 1.5rem;
      box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
      border: 1px solid rgba(255, 255, 255, 0.18);
    }

    .demo-map {
      border-radius: 0.75rem;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    }

    .location-popup h4 {
      margin: 0 0 0.75rem 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: #1f2937;
    }

    .location-popup p {
      margin: 0 0 1rem 0;
      color: #6b7280;
      line-height: 1.5;
    }

    .popup-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
      border-radius: 0.375rem;
      cursor: pointer;
      border: none;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover {
      background: #2563eb;
      transform: translateY(-1px);
    }
  `]
})
export class MapDemoComponent {
  readonly mapCenter = signal<[number, number]>([-90.5069, 14.6349]); // Guatemala City
  readonly mapZoom = signal(12);
  readonly selectedLocation = signal<DemoLocation | null>(null);
  readonly showPopup = signal(false);
  readonly clickMarker = signal<[number, number] | null>(null);
  readonly recentEvents = signal<string[]>([]);

  readonly demoLocations: DemoLocation[] = [
    {
      id: '1',
      name: 'Oficina Central',
      position: [-90.5069, 14.6349],
      description: 'Sede principal ubicada en zona 9, Ciudad de Guatemala.'
    },
    {
      id: '2',
      name: 'Sucursal Xela',
      position: [-91.5206, 14.8407],
      description: 'Sucursal en Quetzaltenango, segunda ciudad más importante.'
    },
    {
      id: '3',
      name: 'Centro de Distribución',
      position: [-90.5069, 14.5500],
      description: 'Centro logístico en las afueras de la capital.'
    },
    {
      id: '4',
      name: 'Oficina Antigua',
      position: [-90.7346, 14.5586],
      description: 'Sede regional en la histórica ciudad de Antigua Guatemala.'
    }
  ];

  flyToLocation(location: DemoLocation): void {
    this.mapCenter.set(location.position);
    this.mapZoom.set(16);
    this.selectedLocation.set(location);
    this.showPopup.set(true);
    this.addEvent(`Volando a: ${location.name}`);
  }

  onMapClick(event: MapClickEvent): void {
    const { lng, lat } = event.lngLat;
    this.clickMarker.set([lng, lat]);
    this.addEvent(`Click en: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    
    // Remove click marker after 3 seconds
    setTimeout(() => {
      this.clickMarker.set(null);
    }, 3000);
  }

  onMarkerClick(event: MarkerClickEvent, location: DemoLocation): void {
    this.selectedLocation.set(location);
    this.showPopup.set(true);
    this.addEvent(`Marker clicked: ${location.name}`);
  }

  onMapLoad(): void {
    this.addEvent('🗺️ Mapa cargado con MapLibre GL');
  }

  onMapMove(event: any): void {
    // Throttle move events
    clearTimeout((this as any).moveTimeout);
    (this as any).moveTimeout = setTimeout(() => {
      this.addEvent(`Mapa movido - Zoom: ${event.zoom.toFixed(1)}`);
    }, 500);
  }

  onPopupOpen(): void {
    this.addEvent('📍 Popup abierto');
  }

  closePopup(): void {
    this.showPopup.set(false);
    this.selectedLocation.set(null);
    this.addEvent('❌ Popup cerrado');
  }

  addEvent(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const event = `[${timestamp}] ${message}`;
    
    this.recentEvents.update(events => {
      const newEvents = [event, ...events];
      return newEvents.slice(0, 10); // Keep only last 10 events
    });
  }
}