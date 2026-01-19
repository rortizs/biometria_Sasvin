import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapStyleService, type MapStyleType } from '../../services/map-style.service';

@Component({
  selector: 'app-map-style-switcher',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="style-switcher" [class.expanded]="isExpanded()">
      <!-- Toggle Button -->
      <button 
        class="toggle-btn"
        (click)="toggleExpanded()"
        [title]="'Cambiar estilo de mapa'"
      >
        🗺️ {{ getCurrentStyleName() }}
        <span class="arrow" [class.rotated]="isExpanded()">▼</span>
      </button>

      <!-- Style Options -->
      @if (isExpanded()) {
        <div class="style-options">
          @for (style of availableStyles; track style.id) {
            <button
              class="style-option"
              [class.active]="currentStyleType() === style.id"
              (click)="selectStyle(style.id)"
            >
              <div class="style-icon">
                {{ getStyleIcon(style.id) }}
              </div>
              <div class="style-info">
                <div class="style-name">{{ style.name }}</div>
                <div class="style-description">{{ style.description }}</div>
              </div>
              @if (currentStyleType() === style.id) {
                <div class="active-indicator">✓</div>
              }
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .style-switcher {
      position: relative;
      z-index: 100;
    }

    .toggle-btn {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 0.5rem;
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      min-width: 140px;
    }

    .toggle-btn:hover {
      background: rgba(255, 255, 255, 1);
      border-color: #3b82f6;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .arrow {
      margin-left: auto;
      transition: transform 0.2s ease;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .arrow.rotated {
      transform: rotate(180deg);
    }

    .style-options {
      position: absolute;
      top: calc(100% + 0.5rem);
      left: 0;
      right: 0;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 0.75rem;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      animation: slideIn 0.2s ease-out;
      min-width: 280px;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .style-option {
      width: 100%;
      background: none;
      border: none;
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      cursor: pointer;
      transition: all 0.2s ease;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    }

    .style-option:last-child {
      border-bottom: none;
    }

    .style-option:hover {
      background: rgba(59, 130, 246, 0.05);
    }

    .style-option.active {
      background: rgba(59, 130, 246, 0.1);
      border-bottom-color: rgba(59, 130, 246, 0.2);
    }

    .style-icon {
      font-size: 1.5rem;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f3f4f6;
      border-radius: 0.5rem;
    }

    .style-option.active .style-icon {
      background: rgba(59, 130, 246, 0.1);
    }

    .style-info {
      flex: 1;
      text-align: left;
    }

    .style-name {
      font-weight: 500;
      color: #1f2937;
      font-size: 0.875rem;
      margin-bottom: 0.125rem;
    }

    .style-description {
      font-size: 0.75rem;
      color: #6b7280;
      line-height: 1.3;
    }

    .active-indicator {
      color: #3b82f6;
      font-weight: 600;
      font-size: 0.875rem;
    }

    /* Dark mode support */
    .dark .toggle-btn {
      background: rgba(31, 41, 55, 0.95);
      color: #f9fafb;
      border-color: rgba(255, 255, 255, 0.1);
    }

    .dark .toggle-btn:hover {
      background: rgba(31, 41, 55, 1);
      border-color: #3b82f6;
    }

    .dark .style-options {
      background: rgba(31, 41, 55, 0.95);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .dark .style-option {
      border-bottom-color: rgba(255, 255, 255, 0.05);
    }

    .dark .style-option:hover {
      background: rgba(59, 130, 246, 0.1);
    }

    .dark .style-name {
      color: #f9fafb;
    }

    .dark .style-description {
      color: #d1d5db;
    }

    .dark .style-icon {
      background: rgba(55, 65, 81, 1);
    }
  `]
})
export class MapStyleSwitcherComponent {
  private readonly mapStyleService = inject(MapStyleService);

  readonly currentStyleType = this.mapStyleService.currentStyleType;
  readonly availableStyles = this.mapStyleService.getAvailableStyles();
  readonly isExpanded = signal(false);

  toggleExpanded(): void {
    this.isExpanded.update(expanded => !expanded);
  }

  selectStyle(styleId: MapStyleType): void {
    this.mapStyleService.setStyleType(styleId);
    this.isExpanded.set(false);
  }

  getCurrentStyleName(): string {
    const current = this.mapStyleService.getStyleById(this.currentStyleType());
    return current?.name || 'Calles';
  }

  getStyleIcon(styleId: MapStyleType): string {
    const icons: Record<MapStyleType, string> = {
      streets: '🏙️',
      satellite: '🛰️',
      hybrid: '🗺️',
      terrain: '⛰️'
    };
    return icons[styleId] || '🗺️';
  }
}