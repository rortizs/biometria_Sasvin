import { 
  Component, 
  OnInit, 
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  input,
  output,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  Popup, 
  LngLatLike,
  PointLike,
  Map as MapLibreMap 
} from 'maplibre-gl';
import { MapComponent } from './map.component';

@Component({
  selector: 'app-map-popup',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #popupContent class="popup-content" [class]="contentClass()">
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .popup-content {
      max-width: 300px;
      padding: 0;
      font-family: inherit;
    }

    .popup-content h1,
    .popup-content h2,
    .popup-content h3,
    .popup-content h4,
    .popup-content h5,
    .popup-content h6 {
      margin: 0 0 0.5rem 0;
      font-weight: 600;
    }

    .popup-content p {
      margin: 0 0 0.75rem 0;
      line-height: 1.5;
    }

    .popup-content p:last-child {
      margin-bottom: 0;
    }
  `]
})
export class MapPopupComponent implements OnInit, OnDestroy {
  @ViewChild('popupContent', { static: true }) popupContent!: ElementRef<HTMLDivElement>;

  private readonly mapComponent = inject(MapComponent);

  // Inputs
  readonly position = input.required<LngLatLike>();
  readonly anchor = input<'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('bottom');
  readonly offset = input<PointLike>([0, 0]);
  readonly closeButton = input<boolean>(true);
  readonly closeOnClick = input<boolean>(true);
  readonly closeOnMove = input<boolean>(false);
  readonly className = input<string>('');
  readonly contentClass = input<string>('');
  readonly maxWidth = input<string>('240px');
  readonly visible = input<boolean>(true);

  // Outputs
  readonly popupOpen = output<Popup>();
  readonly popupClose = output<Popup>();

  private map: MapLibreMap | null = null;
  private popup: Popup | null = null;

  constructor() {
    // React to position changes
    effect(() => {
      if (this.popup && this.visible()) {
        this.popup.setLngLat(this.position());
      }
    });

    // React to visibility changes
    effect(() => {
      if (this.popup && this.map) {
        if (this.visible()) {
          if (!this.popup.isOpen()) {
            this.popup.addTo(this.map);
          }
        } else {
          this.popup.remove();
        }
      }
    });
  }

  ngOnInit(): void {
    this.waitForMap();
  }

  ngOnDestroy(): void {
    if (this.popup) {
      this.popup.remove();
    }
  }

  private waitForMap(): void {
    const map = this.mapComponent.getMap();
    
    if (map) {
      this.map = map;
      this.createPopup();
    } else {
      this.mapComponent.mapLoad.subscribe((mapInstance) => {
        this.map = mapInstance;
        this.createPopup();
      });
    }
  }

  private createPopup(): void {
    if (!this.map) return;

    // Create popup with custom content
    this.popup = new Popup({
      anchor: this.anchor(),
      offset: this.offset() as any,
      closeButton: this.closeButton(),
      closeOnClick: this.closeOnClick(),
      closeOnMove: this.closeOnMove(),
      className: this.className(),
      maxWidth: this.maxWidth()
    })
    .setLngLat(this.position())
    .setDOMContent(this.popupContent.nativeElement);

    if (this.visible()) {
      this.popup.addTo(this.map);
    }

    // Setup event listeners
    this.popup.on('open', () => {
      this.popupOpen.emit(this.popup!);
    });

    this.popup.on('close', () => {
      this.popupClose.emit(this.popup!);
    });
  }

  // Public API methods
  getPopup(): Popup | null {
    return this.popup;
  }

  setPosition(position: LngLatLike): void {
    if (this.popup) {
      this.popup.setLngLat(position);
    }
  }

  open(): void {
    if (this.popup && this.map) {
      this.popup.addTo(this.map);
    }
  }

  close(): void {
    if (this.popup) {
      this.popup.remove();
    }
  }

  toggle(): void {
    if (this.popup) {
      if (this.popup.isOpen()) {
        this.close();
      } else {
        this.open();
      }
    }
  }
}