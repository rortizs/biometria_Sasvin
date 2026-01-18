import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { 
  MapComponent, 
  MapControlsComponent, 
  MapMarkerComponent, 
  MapPopupComponent,
  MapStyleSwitcherComponent,
  type MapClickEvent,
  type MarkerClickEvent
} from '../../../../shared/components/map';
import { LocationService } from '../../../../core/services/location.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { Location, LocationCreate, LocationUpdate } from '../../../../core/models/location.model';

@Component({
  selector: 'app-locations',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MapComponent,
    MapControlsComponent,
    MapMarkerComponent,
    MapPopupComponent,
    MapStyleSwitcherComponent
  ],
  template: `
    <div class="locations-page">
      <header class="page-header">
        <div class="header-left">
          <a routerLink="/admin/dashboard" class="back-link">← Dashboard</a>
          <div class="page-title-section">
            <h1 class="page-title">Sedes / Ubicaciones</h1>
            <p class="page-subtitle">Gestión de ubicaciones con MapLibre GL</p>
          </div>
        </div>
        
        <div class="header-actions">
          <button class="btn-primary" (click)="openCreateModal()">
            + Nueva Sede
          </button>
        </div>
      </header>

      <div class="content-grid">
        <!-- Locations List -->
        <div class="locations-sidebar">
          <div class="sidebar-header">
            <h2>Ubicaciones ({{ locations().length }})</h2>
            @if (isLoading()) {
              <div class="loading">Cargando...</div>
            }
          </div>
          
          <div class="locations-list">
            @if (locations().length === 0 && !isLoading()) {
              <div class="empty-state">
                <span class="empty-icon">📍</span>
                <h3>Sin ubicaciones</h3>
                <p>Agrega tu primera ubicación haciendo clic en el botón "Nueva Sede"</p>
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
                  <p class="address">
                    <span class="label">📍 Dirección:</span>
                    {{ location.address || 'Sin dirección especificada' }}
                  </p>
                  <div class="coords-row">
                    <span class="coords">
                      🌐 {{ location.latitude.toFixed(6) }}, {{ location.longitude.toFixed(6) }}
                    </span>
                    <span class="radius">
                      📏 {{ location.radius_meters }}m
                    </span>
                  </div>
                </div>

                <div class="location-actions" (click)="$event.stopPropagation()">
                  <button 
                    class="btn-secondary btn-sm"
                    (click)="editLocation(location)"
                    title="Editar ubicación"
                  >
                    ✏️ Editar
                  </button>
                  <button 
                    class="btn-danger btn-sm"
                    (click)="deleteLocation(location)"
                    title="Eliminar ubicación"
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Map Section -->
        <div class="map-section">
          <div class="map-header">
            <div class="map-header-left">
              <h2>Mapa Interactivo</h2>
              <div class="map-info">
                <span class="info-badge">MapLibre GL</span>
                @if (selectedLocation()) {
                  <span class="selected-info">
                    📍 {{ selectedLocation()!.name }}
                  </span>
                } @else {
                  <span class="hint">Haz clic en una ubicación o en el mapa para agregar</span>
                }
              </div>
            </div>
            
            <div class="map-header-right">
              <app-map-style-switcher />
            </div>
          </div>
          
          <app-map
            [center]="mapCenter()"
            [zoom]="mapZoom()"
            height="calc(100vh - 200px)"
            containerClass="locations-map"
            (mapClick)="onMapClick($event)"
            (mapLoad)="onMapLoad()"
            (mapMove)="onMapMove($event)"
          >
            <!-- Map Controls -->
            <app-map-controls 
              [navigation]="true"
              [scale]="true"
              [fullscreen]="true"
              [geolocate]="true"
            />

            <!-- Location Markers -->
            @for (location of locations(); track location.id) {
              <app-map-marker
                [position]="[location.longitude, location.latitude]"
                [color]="getMarkerColor(location)"
                size="large"
                [icon]="getMarkerIcon(location)"
                (markerClick)="onMarkerClick($event, location)"
              />
            }

            <!-- Show popup for selected location -->
            @if (selectedLocation() && showPopup()) {
              <app-map-popup
                [position]="[selectedLocation()!.longitude, selectedLocation()!.latitude]"
                anchor="top"
                [closeButton]="true"
                (popupClose)="closePopup()"
                (popupOpen)="onPopupOpen()"
              >
                <div class="location-popup">
                  <div class="popup-header">
                    <h4>{{ selectedLocation()!.name }}</h4>
                    <span class="status-badge" [class]="selectedLocation()!.is_active ? 'active' : 'inactive'">
                      {{ selectedLocation()!.is_active ? '✅ Activa' : '❌ Inactiva' }}
                    </span>
                  </div>
                  
                  <div class="popup-content">
                    @if (selectedLocation()!.address) {
                      <p><strong>📍 Dirección:</strong><br>{{ selectedLocation()!.address }}</p>
                    }
                    <p><strong>🌐 Coordenadas:</strong><br>
                      {{ selectedLocation()!.latitude.toFixed(6) }}, {{ selectedLocation()!.longitude.toFixed(6) }}
                    </p>
                    <p><strong>📏 Radio de validación:</strong> {{ selectedLocation()!.radius_meters }}m</p>
                  </div>
                  
                  <div class="popup-actions">
                    <button class="btn-sm btn-primary" (click)="editLocation(selectedLocation()!)">
                      ✏️ Editar
                    </button>
                    <button class="btn-sm btn-danger" (click)="deleteLocation(selectedLocation()!)">
                      🗑️ Eliminar
                    </button>
                    <button class="btn-sm btn-secondary" (click)="centerOnLocation(selectedLocation()!)">
                      🎯 Centrar
                    </button>
                  </div>
                </div>
              </app-map-popup>
            }

            <!-- Temporary marker for new location -->
            @if (tempMarkerPosition()) {
              <app-map-marker
                [position]="tempMarkerPosition()!"
                color="#22c55e"
                size="large"
                icon="📍"
              />
              
              <app-map-popup
                [position]="tempMarkerPosition()!"
                anchor="bottom"
                [closeButton]="false"
              >
                <div class="temp-popup">
                  <p><strong>Nueva ubicación</strong></p>
                  <p>{{ tempMarkerPosition()![1].toFixed(6) }}, {{ tempMarkerPosition()![0].toFixed(6) }}</p>
                  <button class="btn-sm btn-primary" (click)="confirmNewLocation()">
                    ✅ Crear aquí
                  </button>
                </div>
              </app-map-popup>
            }
          </app-map>
        </div>
      </div>

      <!-- Create/Edit Modal -->
      @if (showModal()) {
        <div class="modal-overlay" (click)="closeModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <header class="modal-header">
              <h2>{{ editMode() ? 'Editar Sede' : 'Nueva Sede' }}</h2>
              <button class="close-btn" (click)="closeModal()">&times;</button>
            </header>

            <div class="modal-content">
              <form (ngSubmit)="saveLocation()" #locationForm="ngForm">
                <div class="form-group">
                  <label for="name">Nombre de la sede *</label>
                  <input 
                    type="text" 
                    id="name"
                    [(ngModel)]="formData.name"
                    name="name"
                    required
                    placeholder="Ej. Oficina Central Guatemala"
                    class="form-input"
                  >
                </div>

                <div class="form-group">
                  <label for="address">Dirección completa</label>
                  <textarea 
                    id="address"
                    [(ngModel)]="formData.address"
                    name="address"
                    placeholder="Dirección completa de la sede"
                    rows="3"
                    class="form-input"
                  ></textarea>
                  <small>Opcional: Ayuda a los empleados a identificar la ubicación</small>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label for="latitude">Latitud *</label>
                    <input 
                      type="number" 
                      id="latitude"
                      [(ngModel)]="formData.latitude"
                      name="latitude"
                      step="0.000001"
                      required
                      class="form-input"
                    >
                    <small>Puedes modificar manualmente o hacer clic en el mapa</small>
                  </div>

                  <div class="form-group">
                    <label for="longitude">Longitud *</label>
                    <input 
                      type="number" 
                      id="longitude"
                      [(ngModel)]="formData.longitude"
                      name="longitude"
                      step="0.000001"
                      required
                      class="form-input"
                    >
                    <small>Puedes modificar manualmente o hacer clic en el mapa</small>
                  </div>
                </div>

                <div class="form-group">
                  <label for="radius">Radio de validación (metros) *</label>
                  <input 
                    type="number" 
                    id="radius"
                    [(ngModel)]="formData.radius_meters"
                    name="radius_meters"
                    required
                    min="10"
                    max="5000"
                    placeholder="100"
                    class="form-input"
                  >
                  <small>Distancia máxima permitida para marcar asistencia desde esta ubicación</small>
                </div>

                <div class="form-group">
                  <label class="checkbox-label">
                    <input 
                      type="checkbox"
                      [(ngModel)]="formData.is_active"
                      name="is_active"
                      class="form-checkbox"
                    >
                    <span class="checkbox-text">✅ Sede activa para asistencia</span>
                  </label>
                  <small>Las sedes inactivas no permiten marcar asistencia</small>
                </div>

                <div class="location-preview">
                  <h4>📍 Vista previa de ubicación</h4>
                  <div class="preview-info">
                    @if (formData.latitude && formData.longitude) {
                      <p><strong>Coordenadas:</strong> {{ formData.latitude }}, {{ formData.longitude }}</p>
                      <p><strong>Radio:</strong> {{ formData.radius_meters || 100 }}m</p>
                    } @else {
                      <p class="hint">Haz clic en el mapa para seleccionar ubicación</p>
                    }
                  </div>
                </div>

                <div class="modal-actions">
                  <button type="button" class="btn-secondary" (click)="closeModal()">
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    class="btn-primary"
                    [disabled]="!locationForm.valid || isSaving()"
                  >
                    {{ isSaving() ? 'Guardando...' : (editMode() ? '✏️ Actualizar Sede' : '➕ Crear Sede') }}
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
      min-height: 100vh;
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      padding: 1.5rem;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
      background: white;
      padding: 1.5rem 2rem;
      border-radius: 1rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(0, 0, 0, 0.05);
    }

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .back-link {
      color: #6b7280;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      transition: color 0.2s ease;
    }

    .back-link:hover {
      color: #3b82f6;
    }

    .page-title-section {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .page-title {
      font-size: 2rem;
      font-weight: 700;
      color: #1f2937;
      margin: 0;
    }

    .page-subtitle {
      color: #6b7280;
      font-size: 1rem;
      margin: 0;
    }

    .header-actions {
      display: flex;
      gap: 1rem;
    }

    .content-grid {
      display: grid;
      grid-template-columns: 400px 1fr;
      gap: 2rem;
      height: calc(100vh - 180px);
    }

    @media (max-width: 1024px) {
      .content-grid {
        grid-template-columns: 1fr;
        height: auto;
      }
    }

    /* Sidebar */
    .locations-sidebar {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(0, 0, 0, 0.05);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-header {
      padding: 1.5rem 1.5rem 1rem 1.5rem;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .sidebar-header h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
      color: #1f2937;
    }

    .loading {
      font-size: 0.875rem;
      color: #6b7280;
      margin-top: 0.5rem;
    }

    .locations-list {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 2rem;
      color: #6b7280;
    }

    .empty-icon {
      font-size: 3rem;
      display: block;
      margin-bottom: 1rem;
    }

    .empty-state h3 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 0.5rem 0;
      color: #374151;
    }

    .empty-state p {
      margin: 0;
      line-height: 1.5;
    }

    .location-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 0.75rem;
      padding: 1.25rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .location-card:hover {
      border-color: #3b82f6;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
      transform: translateY(-1px);
    }

    .location-card.active {
      border-color: #3b82f6;
      background: #eff6ff;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
    }

    .location-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .location-header h3 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0;
      color: #1f2937;
      line-height: 1.4;
    }

    .location-status {
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      background: #fef2f2;
      color: #dc2626;
    }

    .location-status.active {
      background: #f0fdf4;
      color: #16a34a;
    }

    .location-details {
      margin-bottom: 1rem;
    }

    .address {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      line-height: 1.5;
      color: #4b5563;
    }

    .label {
      font-weight: 500;
      color: #374151;
    }

    .coords-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .coords {
      font-family: 'Monaco', 'Menlo', monospace;
    }

    .radius {
      background: #f3f4f6;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-weight: 500;
    }

    .location-actions {
      display: flex;
      gap: 0.5rem;
    }

    /* Map Section */
    .map-section {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(0, 0, 0, 0.05);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .map-header {
      padding: 1.5rem 2rem 1rem 2rem;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
    }

    .map-header-left {
      flex: 1;
    }

    .map-header-right {
      flex-shrink: 0;
    }

    .map-header h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 0.5rem 0;
      color: #1f2937;
    }

    .map-info {
      display: flex;
      gap: 1rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .info-badge {
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .selected-info {
      font-size: 0.875rem;
      color: #059669;
      font-weight: 500;
    }

    .hint {
      font-size: 0.875rem;
      color: #6b7280;
    }

    .locations-map {
      flex: 1;
      border-radius: 0;
    }

    /* Popup Styles */
    .location-popup {
      min-width: 280px;
    }

    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .popup-header h4 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: #1f2937;
    }

    .status-badge {
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
    }

    .status-badge.active {
      background: #f0fdf4;
      color: #16a34a;
    }

    .status-badge.inactive {
      background: #fef2f2;
      color: #dc2626;
    }

    .popup-content p {
      margin: 0.5rem 0;
      font-size: 0.875rem;
      line-height: 1.5;
      color: #4b5563;
    }

    .popup-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
      flex-wrap: wrap;
    }

    .temp-popup {
      text-align: center;
    }

    .temp-popup p {
      margin: 0.5rem 0;
      font-size: 0.875rem;
      color: #374151;
    }

    /* Button Styles */
    .btn-primary {
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }

    .btn-primary:disabled {
      background: #9ca3af;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-secondary:hover {
      background: #e5e7eb;
      border-color: #9ca3af;
    }

    .btn-danger {
      background: #ef4444;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-danger:hover {
      background: #dc2626;
      transform: translateY(-1px);
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
      border-radius: 1rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      max-width: 600px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem 1.5rem 0 1.5rem;
      border-bottom: 1px solid #e5e7eb;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
    }

    .modal-header h2 {
      font-size: 1.5rem;
      font-weight: 600;
      margin: 0;
      color: #1f2937;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.25rem;
    }

    .close-btn:hover {
      background: #f3f4f6;
      color: #374151;
    }

    .modal-content {
      padding: 0 1.5rem 1.5rem 1.5rem;
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
      color: #374151;
    }

    .form-input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.5rem;
      font-size: 1rem;
      transition: border-color 0.2s ease;
    }

    .form-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .form-input[readonly] {
      background: #f9fafb;
      color: #6b7280;
    }

    .form-group small {
      display: block;
      margin-top: 0.25rem;
      color: #6b7280;
      font-size: 0.875rem;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      cursor: pointer;
      font-weight: normal;
    }

    .form-checkbox {
      margin-right: 0.5rem;
      width: auto;
    }

    .checkbox-text {
      color: #374151;
    }

    .location-preview {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }

    .location-preview h4 {
      margin: 0 0 0.75rem 0;
      font-size: 1rem;
      font-weight: 600;
      color: #374151;
    }

    .preview-info p {
      margin: 0.25rem 0;
      font-size: 0.875rem;
      color: #4b5563;
    }

    .preview-info .hint {
      font-style: italic;
      color: #6b7280;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid #e5e7eb;
    }
  `]
})
export class LocationsComponent implements OnInit {
  private readonly locationService = inject(LocationService);
  private readonly toastService = inject(ToastService);

  // State signals
  readonly locations = signal<Location[]>([]);
  readonly selectedLocation = signal<Location | null>(null);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly showModal = signal(false);
  readonly editMode = signal(false);
  readonly showPopup = signal(false);
  readonly tempMarkerPosition = signal<[number, number] | null>(null);

  // Map state
  readonly mapCenter = signal<[number, number]>([-90.5069, 14.6349]); // Guatemala City
  readonly mapZoom = signal(12);

  // Form data
  formData: LocationCreate & { is_active: boolean } = {
    name: '',
    address: '',
    latitude: 0,
    longitude: 0,
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
    this.mapCenter.set([location.longitude, location.latitude]);
    this.mapZoom.set(16);
  }

  closePopup(): void {
    this.showPopup.set(false);
  }

  onMapClick(event: MapClickEvent): void {
    const { lng, lat } = event.lngLat;
    this.tempMarkerPosition.set([lng, lat]);
    
    // Pre-fill form with coordinates
    this.formData.latitude = lat;
    this.formData.longitude = lng;
  }

  onMarkerClick(event: MarkerClickEvent, location: Location): void {
    this.selectLocation(location);
  }

  onMapLoad(): void {
    console.log('🗺️ MapLibre GL loaded successfully!');
  }

  onMapMove(event: any): void {
    // Optional: Handle map movement events
  }

  onPopupOpen(): void {
    console.log('📍 Popup opened');
  }

  getMarkerColor(location: Location): string {
    if (this.selectedLocation()?.id === location.id) return '#ef4444';
    return location.is_active ? '#22c55e' : '#f59e0b';
  }

  getMarkerIcon(location: Location): string {
    return location.is_active ? '🏢' : '🏗️';
  }

  centerOnLocation(location: Location): void {
    this.mapCenter.set([location.longitude, location.latitude]);
    this.mapZoom.set(18);
    this.closePopup();
  }

  confirmNewLocation(): void {
    this.openCreateModal();
  }

  openCreateModal(): void {
    this.editMode.set(false);
    this.showModal.set(true);
    this.resetForm();
  }

  editLocation(location: Location): void {
    this.editMode.set(true);
    this.showModal.set(true);
    this.selectedLocation.set(location);
    this.formData = {
      name: location.name,
      address: location.address || '',
      latitude: location.latitude,
      longitude: location.longitude,
      radius_meters: location.radius_meters,
      is_active: location.is_active
    };
    this.closePopup();
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editMode.set(false);
    this.tempMarkerPosition.set(null);
    this.resetForm();
  }

  private resetForm(): void {
    // Keep coordinates if we have temp marker
    const tempPos = this.tempMarkerPosition();
    this.formData = {
      name: '',
      address: '',
      latitude: tempPos ? tempPos[1] : 0,
      longitude: tempPos ? tempPos[0] : 0,
      radius_meters: 100,
      is_active: true
    };
  }

  async saveLocation(): Promise<void> {
    try {
      this.isSaving.set(true);
      
      const locationData: LocationCreate = {
        name: this.formData.name,
        address: this.formData.address || null,
        latitude: this.formData.latitude,
        longitude: this.formData.longitude,
        radius_meters: this.formData.radius_meters
      };

      if (this.editMode()) {
        const updateData: LocationUpdate = {
          ...locationData,
          is_active: this.formData.is_active
        };
        
        this.locationService.updateLocation(this.selectedLocation()!.id, updateData).subscribe({
          next: () => {
            this.toastService.showSuccess('Ubicación actualizada exitosamente');
            this.closeModal();
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
            this.closeModal();
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
    } catch (error) {
      console.error('Error saving location:', error);
      this.toastService.showError('Error al guardar la ubicación');
      this.isSaving.set(false);
    }
  }

  async deleteLocation(location: Location): Promise<void> {
    if (!confirm(`¿Estás seguro de que deseas eliminar la sede "${location.name}"?`)) {
      return;
    }

    this.locationService.deleteLocation(location.id).subscribe({
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
}