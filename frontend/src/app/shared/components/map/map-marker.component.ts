import { 
  Component, 
  OnInit, 
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  input,
  output,
  effect,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  Marker, 
  LngLatLike,
  PointLike,
  Map as MapLibreMap 
} from 'maplibre-gl';
import { MapComponent } from './map.component';

export interface MarkerClickEvent {
  marker: Marker;
  lngLat: { lng: number; lat: number };
}

@Component({
  selector: 'app-map-marker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #markerElement class="marker-container" [class]="markerClass()">
      <div class="marker-pin" [class]="pinClass()">
        <!-- Custom content slot -->
        <ng-content></ng-content>
        
        <!-- Default marker if no content -->
        @if (!hasCustomContent()) {
          <div class="default-marker" [style.background-color]="color()">
            @if (icon()) {
              <span class="marker-icon">{{ icon() }}</span>
            } @else {
              <div class="marker-dot"></div>
            }
          </div>
        }
      </div>

      <!-- Label -->
      @if (label()) {
        <div class="marker-label" [class]="labelClass()">
          {{ label() }}
        </div>
      }
    </div>
  `,
  styles: [`
    .marker-container {
      position: relative;
      transform: translate(-50%, -100%);
      cursor: pointer;
      z-index: 100;
    }

    .marker-pin {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease-in-out;
    }

    .marker-pin:hover {
      transform: scale(1.1);
    }

    .default-marker {
      width: 24px;
      height: 24px;
      background: #3b82f6;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .default-marker::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 8px solid currentColor;
      color: inherit;
    }

    .marker-icon {
      font-size: 12px;
      color: white;
      font-weight: 600;
    }

    .marker-dot {
      width: 8px;
      height: 8px;
      background: white;
      border-radius: 50%;
    }

    .marker-label {
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-top: 8px;
      background: white;
      color: rgb(17 24 39);
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 500;
      white-space: nowrap;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      border: 1px solid rgb(229 231 235);
    }

    .dark .marker-label {
      background: rgb(31 41 55);
      color: rgb(243 244 246);
      border-color: rgb(75 85 99);
    }

    /* Size variants */
    .marker-pin.small .default-marker {
      width: 18px;
      height: 18px;
    }

    .marker-pin.small .default-marker::after {
      border-left-width: 4px;
      border-right-width: 4px;
      border-top-width: 6px;
    }

    .marker-pin.large .default-marker {
      width: 32px;
      height: 32px;
    }

    .marker-pin.large .default-marker::after {
      border-left-width: 8px;
      border-right-width: 8px;
      border-top-width: 10px;
    }

    .marker-pin.large .marker-icon {
      font-size: 16px;
    }
  `]
})
export class MapMarkerComponent implements OnInit, OnDestroy {
  @ViewChild('markerElement', { static: true }) markerElement!: ElementRef<HTMLDivElement>;

  private readonly mapComponent = inject(MapComponent);

  // Inputs
  readonly position = input.required<LngLatLike>();
  readonly draggable = input<boolean>(false);
  readonly color = input<string>('#3b82f6');
  readonly size = input<'small' | 'medium' | 'large'>('medium');
  readonly icon = input<string>('');
  readonly label = input<string>('');
  readonly anchor = input<'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('bottom');
  readonly markerClass = input<string>('');
  readonly pinClass = input<string>('');
  readonly labelClass = input<string>('');
  readonly visible = input<boolean>(true);

  // Outputs
  readonly markerClick = output<MarkerClickEvent>();
  readonly markerDragEnd = output<{ marker: Marker; lngLat: { lng: number; lat: number } }>();

  // State
  readonly hasCustomContent = signal(false);

  private map: MapLibreMap | null = null;
  private marker: Marker | null = null;

  constructor() {
    // React to position changes
    effect(() => {
      if (this.marker) {
        this.marker.setLngLat(this.position());
      }
    });

    // React to visibility changes
    effect(() => {
      if (this.marker) {
        if (this.visible()) {
          this.marker.addTo(this.map!);
        } else {
          this.marker.remove();
        }
      }
    });

    // React to draggable changes
    effect(() => {
      if (this.marker) {
        this.marker.setDraggable(this.draggable());
      }
    });
  }

  ngOnInit(): void {
    this.checkCustomContent();
    this.waitForMap();
  }

  ngOnDestroy(): void {
    if (this.marker) {
      this.marker.remove();
    }
  }

  private checkCustomContent(): void {
    const hasContent = this.markerElement.nativeElement.children.length > 0;
    this.hasCustomContent.set(hasContent);
  }

  private waitForMap(): void {
    const map = this.mapComponent.getMap();
    
    if (map) {
      this.map = map;
      this.createMarker();
    } else {
      this.mapComponent.mapLoad.subscribe((mapInstance) => {
        this.map = mapInstance;
        this.createMarker();
      });
    }
  }

  private createMarker(): void {
    if (!this.map) return;

    // Create marker with custom element
    this.marker = new Marker({
      element: this.markerElement.nativeElement,
      anchor: this.anchor(),
      draggable: this.draggable()
    })
    .setLngLat(this.position());

    if (this.visible()) {
      this.marker.addTo(this.map);
    }

    // Setup event listeners
    this.marker.getElement().addEventListener('click', () => {
      this.markerClick.emit({
        marker: this.marker!,
        lngLat: {
          lng: this.marker!.getLngLat().lng,
          lat: this.marker!.getLngLat().lat
        }
      });
    });

    if (this.draggable()) {
      this.marker.on('dragend', () => {
        const lngLat = this.marker!.getLngLat();
        this.markerDragEnd.emit({
          marker: this.marker!,
          lngLat: { lng: lngLat.lng, lat: lngLat.lat }
        });
      });
    }
  }

  // Public API methods
  getMarker(): Marker | null {
    return this.marker;
  }

  setPosition(position: LngLatLike): void {
    if (this.marker) {
      this.marker.setLngLat(position);
    }
  }

  remove(): void {
    if (this.marker) {
      this.marker.remove();
    }
  }
}