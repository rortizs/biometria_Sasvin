import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FirstLoginModalComponent } from './core/components/first-login-modal/first-login-modal.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FirstLoginModalComponent],
  template: `
    <router-outlet />
    <app-first-login-modal />
  `,
  styles: [],
})
export class App {}
