import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-simple-demo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="simple-demo">
      <h1>🚀 MapCN Demo - Simple Test</h1>
      <p>Esta es una página de prueba simple para verificar que el routing funciona.</p>
      <div class="test-info">
        <h2>✅ Test Successful!</h2>
        <p>Si puedes ver esta página, el servidor y el routing están funcionando correctamente.</p>
        <p>Ahora vamos a cargar el demo completo con MapLibre GL...</p>
        <a href="/demo/map-full" class="btn">🗺️ Ir al Demo Completo</a>
      </div>
    </div>
  `,
  styles: [`
    .simple-demo {
      padding: 2rem;
      text-align: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      color: white;
      font-family: system-ui, sans-serif;
    }

    .simple-demo h1 {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .test-info {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: 1rem;
      padding: 2rem;
      margin: 2rem auto;
      max-width: 600px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .btn {
      display: inline-block;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      padding: 1rem 2rem;
      border-radius: 0.5rem;
      text-decoration: none;
      font-weight: 600;
      margin-top: 1rem;
      border: 1px solid rgba(255, 255, 255, 0.3);
      transition: all 0.2s ease;
    }

    .btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translateY(-2px);
    }
  `]
})
export class SimpleDemoComponent {}