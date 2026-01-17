import { 
  Component, 
  OnInit, 
  OnDestroy,
  inject,
  input
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  NavigationControl, 
  ScaleControl, 
  FullscreenControl,
  GeolocateControl,
  Map as MapLibreMap,
  IControl
} from 'maplibre-gl';
import { MapComponent } from './map.component';

export type ControlPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface MapControlsConfig {
  navigation?: boolean | { position?: ControlPosition };
  scale?: boolean | { position?: ControlPosition };
  fullscreen?: boolean | { position?: ControlPosition };
  geolocate?: boolean | { position?: ControlPosition };
}

@Component({
  selector: 'app-map-controls',
  standalone: true,
  imports: [CommonModule],
  template: `<!-- Controls are added directly to the map, no template needed -->`,
})
export class MapControlsComponent implements OnInit, OnDestroy {
  private readonly mapComponent = inject(MapComponent);

  // Inputs
  readonly navigation = input<boolean>(true);
  readonly scale = input<boolean>(true);
  readonly fullscreen = input<boolean>(false);
  readonly geolocate = input<boolean>(false);
  readonly position = input<ControlPosition>('top-right');
  readonly config = input<MapControlsConfig>({});

  private map: MapLibreMap | null = null;
  private addedControls: IControl[] = [];

  ngOnInit(): void {
    // Wait for map to be ready
    this.waitForMap();
  }

  ngOnDestroy(): void {
    this.removeAllControls();
  }

  private waitForMap(): void {
    const map = this.mapComponent.getMap();
    
    if (map) {
      this.map = map;
      this.addControls();
    } else {
      // Listen for map load event
      this.mapComponent.mapLoad.subscribe((mapInstance) => {
        this.map = mapInstance;
        this.addControls();
      });
    }
  }

  private addControls(): void {
    if (!this.map) return;

    const config = this.config();
    
    // Navigation Control (zoom +/-, compass)
    if (this.navigation() && config.navigation !== false) {
      const navConfig = typeof config.navigation === 'object' ? config.navigation : {};
      const position = navConfig.position || this.position();
      const control = new NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: true
      });
      
      this.map.addControl(control, position);
      this.addedControls.push(control);
    }

    // Scale Control
    if (this.scale() && config.scale !== false) {
      const scaleConfig = typeof config.scale === 'object' ? config.scale : {};
      const position = scaleConfig.position || 'bottom-left';
      const control = new ScaleControl({
        maxWidth: 200,
        unit: 'metric'
      });
      
      this.map.addControl(control, position);
      this.addedControls.push(control);
    }

    // Fullscreen Control
    if (this.fullscreen() && config.fullscreen !== false) {
      const fullscreenConfig = typeof config.fullscreen === 'object' ? config.fullscreen : {};
      const position = fullscreenConfig.position || this.position();
      const control = new FullscreenControl();
      
      this.map.addControl(control, position);
      this.addedControls.push(control);
    }

    // Geolocate Control
    if (this.geolocate() && config.geolocate !== false) {
      const geoConfig = typeof config.geolocate === 'object' ? config.geolocate : {};
      const position = geoConfig.position || this.position();
      const control = new GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true
        },
        trackUserLocation: true,
        showAccuracyCircle: true
      });
      
      this.map.addControl(control, position);
      this.addedControls.push(control);
    }
  }

  private removeAllControls(): void {
    if (this.map) {
      this.addedControls.forEach(control => {
        this.map!.removeControl(control);
      });
    }
    this.addedControls = [];
  }
}