import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router'; // IMPORTANTE: Importar RouterModule
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  // Ya no necesitas importar los componentes aquí, solo el RouterModule
  imports: [CommonModule, RouterModule], 
  template: `
    <div class="top-bar" *ngIf="isAuthenticated">
      <span>Bienvenido {{ profile?.username }} ({{ profile?.company }})</span>
      <button (click)="logout()">Cerrar sesión</button>
    </div>

    <router-outlet></router-outlet>
  `
})
export class App {
  private readonly authService = new AuthService();
  public profile = this.authService.getProfile();
  public isAuthenticated = this.authService.isAuthenticated();

  public logout(): void {
    this.authService.logout();
    window.location.reload();
  }
}