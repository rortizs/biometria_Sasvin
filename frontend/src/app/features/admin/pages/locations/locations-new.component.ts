import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  MapComponent, 
  MapControlsComponent, 
  MapMarkerComponent, 
  MapPopupComponent,
  type MapClickEvent,
  type MarkerClickEvent
} from '../../../../shared/components/map';
import { LocationService } from '../../../../core/services/location.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { Location } from '../../../../core/models/location.model';

@Component({
  selector: 'app-locations-new',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MapComponent,
    MapControlsComponent,
    MapMarkerComponent,
    MapPopupComponent
  ],
  template: `
    <div class="locations-page">
      <header class="page-header">
        <h1 class="page-title">Gestión de Ubicaciones</h1>
        <p class="page-subtitle">Administra las sedes y ubicaciones del sistema con MapLibre GL</p>
        
        <div class="actions">
          <button 
            class="btn-primary" 
            (click)="showAddLocationModal = true"
          >
            + Agregar Ubicación
          </button>
        </div>
      </header>

      <div class="content-grid">
        <!-- Locations List -->
        <div class="locations-list">
          <h2>Ubicaciones Registradas</h2>
          
          @if (isLoading()) {
            <div class="loading">Cargando ubicaciones...</div>
          }
          
          @if (locations().length === 0 && !isLoading()) {
            <div class="empty-state">
              <span class="empty-icon">📍</span>
              <h3>Sin ubicaciones</h3>
              <p>Agrega tu primera ubicación haciendo clic en el mapa</p>
            </div>
          }

          @for (location of locations(); track location.id) {
            <div 
              class="location-card"
              [class.active]="selectedLocation()?.id === location.id"
              (click)="selectLocation(location)"
            >
              <div class="location-header">
                <h3>{{ location.name }}</h3>
                <span class="location-status" [class.active]="location.is_active">
                  {{ location.is_active ? 'Activa' : 'Inactiva' }}
                </span>
              </div>
              
              <div class="location-details">
                <p><strong>Dirección:</strong> {{ location.address }}</p>
                <p><strong>Radio:</strong> {{ location.radius_meters }}m</p>
                <p><strong>Coordenadas:</strong> {{ location.latitude.toFixed(6) }}, {{ location.longitude.toFixed(6) }}</p>
              </div>

              <div class="location-actions">
                <button 
                  class="btn-secondary"
                  (click)="editLocation(location); $event.stopPropagation()"
                >
                  Editar
                </button>
                <button 
                  class="btn-danger"
                  (click)="deleteLocation(location.id); $event.stopPropagation()"
                >
                  Eliminar
                </button>
              </div>
            </div>
          }
        </div>

        <!-- Map -->
        <div class="map-section">
          <h2>Mapa Interactivo</h2>
          
          <app-map
            [center]="mapCenter()"
            [zoom]="mapZoom()"
            height="500px"
            containerClass="locations-map"
            (mapClick)="onMapClick($event)"
            (mapLoad)="onMapLoad()"
          >
            <app-map-controls 
              [navigation]="true"
              [scale]="true"
              [fullscreen]="true"
              [geolocate]="true"
            />

            @for (location of locations(); track location.id) {
              <app-map-marker
                [position]="[location.longitude, location.latitude]"
                [color]="location.is_active ? '#22c55e' : '#ef4444'"
                size="large"
                [icon]="'🏢'"
                (markerClick)="onMarkerClick($event, location)"
              />

              <!-- Show popup for selected location -->
              @if (selectedLocation()?.id === location.id && showPopup()) {
                <app-map-popup
                  [position]="[location.longitude, location.latitude]"
                  anchor="top"
                  [closeButton]="true"
                  (popupClose)="closePopup()"
                >
                  <div class="location-popup">
                    <h4>{{ location.name }}</h4>
                    <p><strong>📍 Dirección:</strong><br>{{ location.address }}</p>
                    <p><strong>📏 Radio:</strong> {{ location.radius_meters }}m</p>
                    <p><strong>📊 Estado:</strong> 
                      <span [class]="location.is_active ? 'status-active' : 'status-inactive'">
                        {{ location.is_active ? 'Activa' : 'Inactiva' }}
                      </span>
                    </p>
                    <div class="popup-actions">
                      <button class="btn-sm btn-primary" (click)="editLocation(location)">
                        Editar
                      </button>
                      <button class="btn-sm btn-danger" (click)="deleteLocation(location.id)">
                        Eliminar
                      </button>
                    </div>
                  </div>
                </app-map-popup>
              }
            }

            <!-- Temporary marker for new location -->
            @if (tempMarkerPosition()) {
              <app-map-marker
                [position]="tempMarkerPosition()!"
                color="#3b82f6"
                size="large"
                icon="📍"
              />
            }
          </app-map>

          <div class="map-instructions">
            <p>💡 <strong>Instrucciones:</strong></p>
            <ul>
              <li>Haz clic en el mapa para agregar una nueva ubicación</li>
              <li>Haz clic en los marcadores para ver detalles</li>
              <li>Usa los controles para navegar y buscar tu ubicación</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Add/Edit Location Modal -->
      @if (showAddLocationModal || editingLocation()) {
        <div class="modal-overlay" (click)="closeModals()">
          <div class="modal" (click)="$event.stopPropagation()">
            <header class="modal-header">
              <h2>{{ editingLocation() ? 'Editar' : 'Nueva' }} Ubicación</h2>
              <button class="close-btn" (click)="closeModals()">&times;</button>
            </header>

            <div class="modal-content">
              <form (ngSubmit)="saveLocation()" #locationForm="ngForm">
                <div class="form-group">
                  <label for="name">Nombre *</label>
                  <input 
                    type="text" 
                    id="name"
                    [(ngModel)]="locationForm.name"
                    name="name"
                    required
                    placeholder="Ej. Oficina Central"
                  >
                </div>

                <div class="form-group">
                  <label for="address">Dirección *</label>
                  <textarea 
                    id="address"
                    [(ngModel)]="locationForm.address"
                    name="address"
                    required
                    placeholder="Dirección completa de la ubicación"
                    rows="3"
                  ></textarea>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label for="latitude">Latitud *</label>
                    <input 
                      type="number" 
                      id="latitude"
                      [(ngModel)]="locationForm.latitude"
                      name="latitude"
                      step="any"
                      required
                    >
                  </div>

                  <div class="form-group">
                    <label for="longitude">Longitud *</label>
                    <input 
                      type="number" 
                      id="longitude"
                      [(ngModel)]="locationForm.longitude"
                      name="longitude"
                      step="any"
                      required
                    >
                  </div>
                </div>

                <div class="form-group">
                  <label for="radius">Radio de validación (metros) *</label>
                  <input 
                    type="number" 
                    id="radius"
                    [(ngModel)]="locationForm.radius"
                    name="radius"
                    required
                    min="1"
                    placeholder="100"
                  >
                  <small>Distancia máxima permitida para marcar asistencia</small>
                </div>

                <div class="form-group">
                  <label class="checkbox-label">
                    <input 
                      type="checkbox"
                      [(ngModel)]="locationForm.is_active"
                      name="is_active"
                    >
                    <span class="checkbox-text">Ubicación activa</span>
                  </label>
                </div>

                <div class="modal-actions">
                  <button type="button" class="btn-secondary" (click)="closeModals()">
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    class="btn-primary"
                    [disabled]="!locationForm.valid || isSaving()"
                  >
                    {{ isSaving() ? 'Guardando...' : (editingLocation() ? 'Actualizar' : 'Crear') }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .locations-page {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 2rem;
    }

    .page-title {
      font-size: 2rem;
      font-weight: 700;
      color: rgb(17 24 39);
      margin: 0;
    }

    .dark .page-title {
      color: rgb(243 244 246);
    }

    .page-subtitle {
      color: rgb(107 114 128);
      margin: 0.5rem 0 0 0;
      font-size: 1rem;
    }

    .dark .page-subtitle {
      color: rgb(156 163 175);
    }

    .actions {
      display: flex;
      gap: 1rem;
    }

    .content-grid {
      display: grid;
      grid-template-columns: 400px 1fr;
      gap: 2rem;
    }

    @media (max-width: 1024px) {
      .content-grid {
        grid-template-columns: 1fr;
        gap: 1.5rem;
      }
    }

    /* Locations List */
    .locations-list {
      background: white;
      border-radius: 0.75rem;
      border: 1px solid rgb(229 231 235);
      padding: 1.5rem;
      height: fit-content;
    }

    .dark .locations-list {
      background: rgb(31 41 55);
      border-color: rgb(75 85 99);
    }

    .locations-list h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 1.5rem 0;
      color: rgb(17 24 39);
    }

    .dark .locations-list h2 {
      color: rgb(243 244 246);
    }

    .loading {
      text-align: center;
      color: rgb(107 114 128);
      padding: 2rem;
    }

    .dark .loading {
      color: rgb(156 163 175);
    }

    .empty-state {
      text-align: center;
      padding: 3rem 2rem;
      color: rgb(107 114 128);
    }

    .dark .empty-state {
      color: rgb(156 163 175);
    }

    .empty-icon {
      font-size: 3rem;
      display: block;
      margin-bottom: 1rem;
    }

    .location-card {
      border: 1px solid rgb(229 231 235);
      border-radius: 0.5rem;
      padding: 1rem;
      margin-bottom: 1rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .dark .location-card {
      border-color: rgb(75 85 99);
      background: rgb(55 65 81);
    }

    .location-card:hover {
      border-color: rgb(59 130 246);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
    }

    .location-card.active {
      border-color: rgb(59 130 246);
      background: rgb(239 246 255);
    }

    .dark .location-card.active {
      background: rgb(30 58 138);
    }

    .location-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .location-header h3 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0;
      color: rgb(17 24 39);
    }

    .dark .location-header h3 {
      color: rgb(243 244 246);
    }

    .location-status {
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      background: rgb(239 68 68);
      color: white;
    }

    .location-status.active {
      background: rgb(34 197 94);
    }

    .location-details p {
      margin: 0.25rem 0;
      font-size: 0.875rem;
      color: rgb(75 85 99);
    }

    .dark .location-details p {
      color: rgb(156 163 175);
    }

    .location-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    /* Map Section */
    .map-section {
      background: white;
      border-radius: 0.75rem;
      border: 1px solid rgb(229 231 235);
      padding: 1.5rem;
    }

    .dark .map-section {
      background: rgb(31 41 55);
      border-color: rgb(75 85 99);
    }

    .map-section h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 1.5rem 0;
      color: rgb(17 24 39);
    }

    .dark .map-section h2 {
      color: rgb(243 244 246);
    }

    .locations-map {
      border-radius: 0.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    .map-instructions {
      margin-top: 1rem;
      padding: 1rem;
      background: rgb(249 250 251);
      border-radius: 0.5rem;
      border: 1px solid rgb(229 231 235);
    }

    .dark .map-instructions {
      background: rgb(55 65 81);
      border-color: rgb(75 85 99);
    }

    .map-instructions p {
      margin: 0 0 0.5rem 0;
      font-weight: 600;
      color: rgb(17 24 39);
    }

    .dark .map-instructions p {
      color: rgb(243 244 246);
    }

    .map-instructions ul {
      margin: 0;
      padding-left: 1.5rem;
      color: rgb(75 85 99);
    }

    .dark .map-instructions ul {
      color: rgb(156 163 175);
    }

    .map-instructions li {
      margin: 0.25rem 0;
    }

    /* Popup Styles */
    .location-popup h4 {
      margin: 0 0 0.75rem 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: rgb(17 24 39);
    }

    .dark .location-popup h4 {
      color: rgb(243 244 246);
    }

    .location-popup p {
      margin: 0.5rem 0;
      font-size: 0.875rem;
      line-height: 1.5;
      color: rgb(75 85 99);
    }

    .dark .location-popup p {
      color: rgb(156 163 175);
    }

    .status-active {
      color: rgb(34 197 94);
      font-weight: 600;
    }

    .status-inactive {
      color: rgb(239 68 68);
      font-weight: 600;
    }

    .popup-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    /* Common Button Styles */
    .btn-primary {
      background: rgb(59 130 246);
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-primary:hover {
      background: rgb(37 99 235);
      transform: translateY(-1px);
    }

    .btn-primary:disabled {
      background: rgb(156 163 175);
      cursor: not-allowed;
      transform: none;
    }

    .btn-secondary {
      background: rgb(243 244 246);
      color: rgb(17 24 39);
      border: 1px solid rgb(229 231 235);
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .dark .btn-secondary {
      background: rgb(55 65 81);
      color: rgb(243 244 246);
      border-color: rgb(75 85 99);
    }

    .btn-secondary:hover {
      background: rgb(229 231 235);
    }

    .dark .btn-secondary:hover {
      background: rgb(75 85 99);
    }

    .btn-danger {
      background: rgb(239 68 68);
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-danger:hover {
      background: rgb(220 38 38);
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }

    .modal {
      background: white;
      border-radius: 0.75rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      max-width: 500px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
    }

    .dark .modal {
      background: rgb(31 41 55);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem 1.5rem 0 1.5rem;
    }

    .modal-header h2 {
      font-size: 1.5rem;
      font-weight: 600;
      margin: 0;
      color: rgb(17 24 39);
    }

    .dark .modal-header h2 {
      color: rgb(243 244 246);
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: rgb(107 114 128);
      padding: 0;
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.25rem;
    }

    .dark .close-btn {
      color: rgb(156 163 175);
    }

    .close-btn:hover {
      background: rgb(243 244 246);
      color: rgb(17 24 39);
    }

    .dark .close-btn:hover {
      background: rgb(55 65 81);
      color: rgb(243 244 246);
    }

    .modal-content {
      padding: 1.5rem;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .form-group label {
      display: block;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: rgb(17 24 39);
    }

    .dark .form-group label {
      color: rgb(243 244 246);
    }

    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid rgb(229 231 235);
      border-radius: 0.5rem;
      font-size: 1rem;
      transition: border-color 0.2s ease;
      background: white;
      color: rgb(17 24 39);
    }

    .dark .form-group input,
    .dark .form-group textarea {
      background: rgb(55 65 81);
      color: rgb(243 244 246);
      border-color: rgb(75 85 99);
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: rgb(59 130 246);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .form-group small {
      display: block;
      margin-top: 0.25rem;
      color: rgb(107 114 128);
      font-size: 0.875rem;
    }

    .dark .form-group small {
      color: rgb(156 163 175);
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      cursor: pointer;
      font-weight: normal;
    }

    .checkbox-label input[type="checkbox"] {
      margin-right: 0.5rem;
      width: auto;
    }

    .checkbox-text {
      color: rgb(17 24 39);
    }

    .dark .checkbox-text {
      color: rgb(243 244 246);
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgb(229 231 235);
    }

    .dark .modal-actions {
      border-top-color: rgb(75 85 99);
    }
  `]
})
export class LocationsNewComponent implements OnInit {
  private readonly locationService = inject(LocationService);
  private readonly toastService = inject(ToastService);

  // State
  readonly locations = signal<Location[]>([]);
  readonly selectedLocation = signal<Location | null>(null);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly mapCenter = signal<[number, number]>([-90.5069, 14.6349]); // Guatemala City
  readonly mapZoom = signal(12);
  readonly showPopup = signal(false);
  readonly tempMarkerPosition = signal<[number, number] | null>(null);
  readonly editingLocation = signal<Location | null>(null);

  // Modal state
  showAddLocationModal = false;

  // Form data
  locationForm: any = {
    name: '',
    address: '',
    latitude: null,
    longitude: null,
    radius_meters: 100,
    is_active: true
  };

  ngOnInit(): void {
    this.loadLocations();
  }

  async loadLocations(): Promise<void> {
    try {
      this.isLoading.set(true);
      this.locationService.getLocations(false).subscribe({
        next: (locations) => {
          this.locations.set(locations);
          // Auto-fit map to show all locations
          if (locations.length > 0) {
            this.fitMapToLocations(locations);
          }
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading locations:', error);
          this.toastService.showError('Error al cargar las ubicaciones');
          this.isLoading.set(false);
        }
      });
    } catch (error) {
      console.error('Error loading locations:', error);
      this.toastService.showError('Error al cargar las ubicaciones');
      this.isLoading.set(false);
    }
  }

  private fitMapToLocations(locations: Location[]): void {
    if (locations.length === 1) {
      const loc = locations[0];
      this.mapCenter.set([loc.longitude, loc.latitude]);
      this.mapZoom.set(16);
    } else if (locations.length > 1) {
      // Calculate bounds and center
      const lats = locations.map(l => l.latitude);
      const lngs = locations.map(l => l.longitude);
      
      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      
      this.mapCenter.set([centerLng, centerLat]);
      this.mapZoom.set(12);
    }
  }

  selectLocation(location: Location): void {
    this.selectedLocation.set(location);
    this.showPopup.set(true);
    
    // Center map on selected location
    this.mapCenter.set([location.longitude, location.latitude]);
    this.mapZoom.set(16);
  }

  closePopup(): void {
    this.showPopup.set(false);
  }

  onMapClick(event: MapClickEvent): void {
    // Set temporary marker position
    const { lng, lat } = event.lngLat;
    this.tempMarkerPosition.set([lng, lat]);
    
    // Pre-fill form with coordinates
    this.locationForm = {
      name: '',
      address: '',
      latitude: lat,
      longitude: lng,
      radius_meters: 100,
      is_active: true
    };
    
    this.showAddLocationModal = true;
  }

  onMarkerClick(event: MarkerClickEvent, location: Location): void {
    this.selectLocation(location);
  }

  onMapLoad(): void {
    console.log('Map loaded successfully with MapLibre GL!');
  }

  editLocation(location: Location): void {
    this.editingLocation.set(location);
    this.locationForm = {
      name: location.name,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      radius_meters: location.radius_meters,
      is_active: location.is_active
    };
    this.showAddLocationModal = true;
    this.closePopup();
  }

  async saveLocation(): Promise<void> {
    try {
      this.isSaving.set(true);
      
      const locationData = {
        name: this.locationForm.name,
        address: this.locationForm.address,
        latitude: this.locationForm.latitude,
        longitude: this.locationForm.longitude,
        radius_meters: this.locationForm.radius_meters,
        is_active: this.locationForm.is_active
      };

      if (this.editingLocation()) {
        this.locationService.updateLocation(this.editingLocation()!.id, locationData).subscribe({
          next: () => {
            this.toastService.showSuccess('Ubicación actualizada exitosamente');
            this.closeModals();
            this.loadLocations();
            this.isSaving.set(false);
          },
          error: (error) => {
            console.error('Error updating location:', error);
            this.toastService.showError('Error al actualizar la ubicación');
            this.isSaving.set(false);
          }
        });
      } else {
        this.locationService.createLocation(locationData).subscribe({
          next: () => {
            this.toastService.showSuccess('Ubicación creada exitosamente');
            this.closeModals();
            this.loadLocations();
            this.isSaving.set(false);
          },
          error: (error) => {
            console.error('Error creating location:', error);
            this.toastService.showError('Error al crear la ubicación');
            this.isSaving.set(false);
          }
        });
      }


  }

  async deleteLocation(id: string): Promise<void> {
    if (!confirm('¿Estás seguro de que deseas eliminar esta ubicación?')) {
      return;
    }

    this.locationService.deleteLocation(id).subscribe({
      next: () => {
        this.toastService.showSuccess('Ubicación eliminada exitosamente');
        this.loadLocations();
        this.closePopup();
      },
      error: (error) => {
        console.error('Error deleting location:', error);
        this.toastService.showError('Error al eliminar la ubicación');
      }
    });
  }

  closeModals(): void {
    this.showAddLocationModal = false;
    this.editingLocation.set(null);
    this.tempMarkerPosition.set(null);
    this.locationForm = {
      name: '',
      address: '',
      latitude: null,
      longitude: null,
      radius: 100,
      is_active: true
    };
  }
}