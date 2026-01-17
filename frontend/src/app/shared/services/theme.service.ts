import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly _theme = signal<Theme>('system');
  
  readonly theme = this._theme.asReadonly();
  readonly isDark = signal(false);

  constructor() {
    this.initializeTheme();
  }

  private initializeTheme(): void {
    const stored = localStorage.getItem('theme') as Theme;
    const theme = stored || 'system';
    this.setTheme(theme);
  }

  setTheme(theme: Theme): void {
    this._theme.set(theme);
    localStorage.setItem('theme', theme);
    
    const root = document.documentElement;
    
    if (theme === 'dark') {
      root.classList.add('dark');
      this.isDark.set(true);
    } else if (theme === 'light') {
      root.classList.remove('dark');
      this.isDark.set(false);
    } else {
      // System preference
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const isDarkMode = mediaQuery.matches;
      
      if (isDarkMode) {
        root.classList.add('dark');
        this.isDark.set(true);
      } else {
        root.classList.remove('dark');
        this.isDark.set(false);
      }

      // Listen for system theme changes
      mediaQuery.addEventListener('change', (e) => {
        if (this._theme() === 'system') {
          if (e.matches) {
            root.classList.add('dark');
            this.isDark.set(true);
          } else {
            root.classList.remove('dark');
            this.isDark.set(false);
          }
        }
      });
    }
  }

  toggleTheme(): void {
    const current = this._theme();
    if (current === 'light') {
      this.setTheme('dark');
    } else if (current === 'dark') {
      this.setTheme('system');
    } else {
      this.setTheme('light');
    }
  }
}