import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PolicyDesignerComponent } from './features/policy-designer/components/policy-designer/policy-designer.component';
import { LoginComponent } from './features/login/login.component';
import { AdminSoftwareComponent } from './features/admin-software/admin-software.component';
import { AdminCompanyComponent } from './features/admin-company/admin-company.component';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, PolicyDesignerComponent, LoginComponent, AdminSoftwareComponent, AdminCompanyComponent],
  template: `
    <ng-container *ngIf="isAuthenticated; else loginTemplate">
      <div class="top-bar">
        <span>Bienvenido {{ profile?.username }} ({{ profile?.company }})</span>
        <button (click)="logout()">Cerrar sesión</button>
      </div>

      <app-admin-software *ngIf="isSoftwareAdmin"></app-admin-software>
      <app-admin-company *ngIf="isCompanyAdmin"></app-admin-company>
      <app-policy-designer *ngIf="isFunctionary"></app-policy-designer>
      
    </ng-container>
    <ng-template #loginTemplate>
      <app-login></app-login>
    </ng-template>
  `
})
export class App {
  private readonly authService = new AuthService();
  public profile = this.authService.getProfile();
  public isAuthenticated = this.authService.isAuthenticated();
  public isSoftwareAdmin = this.authService.hasRole('SOFTWARE_ADMIN');
  public isCompanyAdmin = this.authService.hasRole('COMPANY_ADMIN');
  public isFunctionary = this.authService.hasRole('FUNCTIONARY');

  public logout(): void {
    this.authService.logout();
    window.location.reload();
  }
}
