import { Component, OnInit, AfterViewInit, inject, signal, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { LocationService } from '../../../../core/services/location.service';
import { Location, LocationCreate } from '../../../../core/models/location.model';

@Component({
  selector: 'app-locations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="locations-page">
      <header class="header">
        <div>
          <a routerLink="/admin/dashboard" class="back-link">← Dashboard</a>
          <h1>Sedes / Ubicaciones</h1>
        </div>
        <button class="btn btn-primary" (click)="openCreateModal()">
          + Nueva Sede
        </button>
      </header>

      <div class="content">
        <!-- Locations list -->
        <div class="locations-list">
          @for (location of locations(); track location.id) {
            <div
              class="location-card"
              [class.selected]="selectedLocation()?.id === location.id"
              (click)="selectLocation(location)"
            >
              <h3>{{ location.name }}</h3>
              <p class="address">{{ location.address || 'Sin dirección' }}</p>
              <div class="coords">
                <span>📍 {{ location.latitude.toFixed(4) }}, {{ location.longitude.toFixed(4) }}</span>
                <span class="radius">Radio: {{ location.radius_meters }}m</span>
              </div>
              <div class="card-actions">
                <button class="btn btn-sm btn-danger" (click)="deleteLocation(location, $event)">
                  Eliminar
                </button>
              </div>
            </div>
          } @empty {
            <div class="empty">No hay sedes registradas</div>
          }
        </div>

        <!-- Map -->
        <div class="map-container">
          <div #mapElement id="map"></div>
        </div>
      </div>

      <!-- Create/Edit Modal -->
      @if (showModal()) {
        <div class="modal-overlay" (click)="closeModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <h2>{{ editMode() ? 'Editar Sede' : 'Nueva Sede' }}</h2>
            <form (ngSubmit)="saveLocation()">
              <div class="form-group">
                <label>Nombre *</label>
                <input [(ngModel)]="formData.name" name="name" required />
              </div>

              <div class="form-group">
                <label>Dirección</label>
                <input [(ngModel)]="formData.address" name="address" />
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Latitud *</label>
                  <input
                    type="number"
                    [(ngModel)]="formData.latitude"
                    name="latitude"
                    step="0.0001"
                    required
                  />
                </div>
                <div class="form-group">
                  <label>Longitud *</label>
                  <input
                    type="number"
                    [(ngModel)]="formData.longitude"
                    name="longitude"
                    step="0.0001"
                    required
                  />
                </div>
              </div>

              <div class="form-group">
                <label>Radio permitido (metros) *</label>
                <input
                  type="number"
                  [(ngModel)]="formData.radius_meters"
                  name="radius"
                  min="10"
                  max="5000"
                  required
                />
                <small>Distancia máxima para validar asistencia</small>
              </div>

              <div class="map-picker">
                <p>Haz clic en el mapa para seleccionar ubicación:</p>
                <div #modalMapElement id="modal-map"></div>
              </div>

              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" (click)="closeModal()">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-primary">
                  {{ editMode() ? 'Guardar' : 'Crear' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .locations-page {
      min-height: 100vh;
      background: #f3f4f6;
      padding: 2rem;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 2rem;
    }

    .back-link {
      color: #6b7280;
      text-decoration: none;
      font-size: 0.875rem;
    }

    h1 {
      font-size: 1.8rem;
      color: #1f2937;
      margin-top: 0.5rem;
    }

    .content {
      display: grid;
      grid-template-columns: 350px 1fr;
      gap: 2rem;
      height: calc(100vh - 150px);
    }

    .locations-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow-y: auto;
    }

    .location-card {
      background: white;
      border-radius: 0.75rem;
      padding: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      cursor: pointer;
      border: 2px solid transparent;
      transition: all 0.2s;
    }

    .location-card:hover {
      border-color: #93c5fd;
    }

    .location-card.selected {
      border-color: #3b82f6;
      background: #eff6ff;
    }

    .location-card h3 {
      margin: 0 0 0.5rem;
      color: #1f2937;
    }

    .location-card .address {
      color: #6b7280;
      font-size: 0.875rem;
      margin: 0 0 0.5rem;
    }

    .location-card .coords {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #9ca3af;
    }

    .location-card .radius {
      background: #e5e7eb;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
    }

    .card-actions {
      margin-top: 0.75rem;
      display: flex;
      justify-content: flex-end;
    }

    .map-container {
      background: white;
      border-radius: 1rem;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    #map {
      width: 100%;
      height: 100%;
      min-height: 400px;
    }

    .empty {
      text-align: center;
      padding: 2rem;
      color: #9ca3af;
    }

    .btn {
      padding: 0.625rem 1.25rem;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }

    .btn-primary { background: #3b82f6; color: white; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.875rem; }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: white;
      padding: 2rem;
      border-radius: 1rem;
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal h2 {
      margin: 0 0 1.5rem;
      color: #1f2937;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #374151;
    }

    .form-group input {
      width: 100%;
      padding: 0.625rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      box-sizing: border-box;
    }

    .form-group input:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .form-group small {
      display: block;
      margin-top: 0.25rem;
      color: #6b7280;
      font-size: 0.75rem;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .map-picker {
      margin-top: 1rem;
    }

    .map-picker p {
      margin: 0 0 0.5rem;
      color: #6b7280;
      font-size: 0.875rem;
    }

    #modal-map {
      width: 100%;
      height: 200px;
      border-radius: 0.5rem;
      border: 2px solid #e5e7eb;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }
  `],
})
export class LocationsComponent implements OnInit, AfterViewInit {
  @ViewChild('mapElement') mapElement!: ElementRef;
  @ViewChild('modalMapElement') modalMapElement!: ElementRef;

  private readonly locationService = inject(LocationService);

  readonly locations = signal<Location[]>([]);
  readonly selectedLocation = signal<Location | null>(null);
  readonly showModal = signal(false);
  readonly editMode = signal(false);

  private map: L.Map | null = null;
  private modalMap: L.Map | null = null;
  private markers: L.Marker[] = [];
  private circles: L.Circle[] = [];
  private modalMarker: L.Marker | null = null;

  formData: LocationCreate = {
    name: '',
    address: '',
    latitude: 14.6349,
    longitude: -90.5069,
    radius_meters: 50,
  };

  ngOnInit(): void {
    this.loadLocations();
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  private initMap(): void {
    // Fix Leaflet icon issue
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    this.map = L.map(this.mapElement.nativeElement).setView([14.6349, -90.5069], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);
  }

  loadLocations(): void {
    this.locationService.getLocations(false).subscribe((locations) => {
      this.locations.set(locations);
      this.updateMapMarkers();
    });
  }

  private updateMapMarkers(): void {
    if (!this.map) return;

    // Clear existing markers and circles
    this.markers.forEach(m => m.remove());
    this.circles.forEach(c => c.remove());
    this.markers = [];
    this.circles = [];

    // Add markers for each location
    this.locations().forEach(loc => {
      const marker = L.marker([loc.latitude, loc.longitude])
        .addTo(this.map!)
        .bindPopup(`<b>${loc.name}</b><br>${loc.address || ''}<br>Radio: ${loc.radius_meters}m`);

      const circle = L.circle([loc.latitude, loc.longitude], {
        radius: loc.radius_meters,
        color: '#3b82f6',
        fillColor: '#93c5fd',
        fillOpacity: 0.3,
      }).addTo(this.map!);

      this.markers.push(marker);
      this.circles.push(circle);
    });

    // Fit bounds if there are locations
    if (this.locations().length > 0) {
      const bounds = L.latLngBounds(this.locations().map(l => [l.latitude, l.longitude]));
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  selectLocation(location: Location): void {
    this.selectedLocation.set(location);
    if (this.map) {
      this.map.setView([location.latitude, location.longitude], 16);
    }
  }

  openCreateModal(): void {
    this.editMode.set(false);
    this.formData = {
      name: '',
      address: '',
      latitude: 14.6349,
      longitude: -90.5069,
      radius_meters: 50,
    };
    this.showModal.set(true);

    setTimeout(() => this.initModalMap(), 100);
  }

  private initModalMap(): void {
    if (this.modalMap) {
      this.modalMap.remove();
    }

    this.modalMap = L.map(this.modalMapElement.nativeElement).setView(
      [this.formData.latitude, this.formData.longitude],
      14
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(this.modalMap);

    this.modalMarker = L.marker([this.formData.latitude, this.formData.longitude], {
      draggable: true,
    }).addTo(this.modalMap);

    this.modalMarker.on('dragend', () => {
      const pos = this.modalMarker!.getLatLng();
      this.formData.latitude = pos.lat;
      this.formData.longitude = pos.lng;
    });

    this.modalMap.on('click', (e: L.LeafletMouseEvent) => {
      this.formData.latitude = e.latlng.lat;
      this.formData.longitude = e.latlng.lng;
      this.modalMarker?.setLatLng(e.latlng);
    });
  }

  closeModal(): void {
    this.showModal.set(false);
    if (this.modalMap) {
      this.modalMap.remove();
      this.modalMap = null;
    }
  }

  saveLocation(): void {
    this.locationService.createLocation(this.formData).subscribe({
      next: () => {
        this.closeModal();
        this.loadLocations();
      },
      error: (err) => {
        alert(err.error?.detail || 'Error al crear sede');
      },
    });
  }

  deleteLocation(location: Location, event: Event): void {
    event.stopPropagation();
    if (confirm(`¿Eliminar sede "${location.name}"?`)) {
      this.locationService.deleteLocation(location.id).subscribe(() => {
        this.loadLocations();
        if (this.selectedLocation()?.id === location.id) {
          this.selectedLocation.set(null);
        }
      });
    }
  }
}
