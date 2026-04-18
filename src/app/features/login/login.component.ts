import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})


export class LoginComponent {
  public username = '';
  public password = '';
  public company = '';
  public parentCompany = '';
  public role: 'SOFTWARE_ADMIN' | 'FUNCTIONARY' = 'FUNCTIONARY';
  public isRegisterMode = false;
  public message = '';
  public loading = false;

  // 1. INYECCIÓN DE DEPENDENCIAS (La forma correcta en Angular)
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  public get isLoggedIn(): boolean {
    return this.authService.isAuthenticated();
  }

  public getProfile() {
    return this.authService.getProfile();
  }

  public async login(): Promise<void> {
    this.message = '';
    this.loading = true;
    try {
      // Esperamos a que el proceso de login termine
      await this.authService.login(this.username.trim(), this.password);
      
      // 2. NAVEGACIÓN PROGRAMÁTICA
      // Evaluamos el rol y enviamos al usuario a su ruta correspondiente
      if (this.authService.hasRole('SOFTWARE_ADMIN')) {
        this.router.navigate(['/admin-software']);
      } else if (this.authService.hasRole('COMPANY_ADMIN')) {
        this.router.navigate(['/admin-empresa']);
      } else {
        // Por descarte, si no es admin, asume que es funcionario/diseñador
        this.router.navigate(['/disenador']);
      }

    } catch (error) {
      this.message = (error instanceof Error ? error.message : 'Error de autenticación');
    } finally {
      this.loading = false;
    }
  }

  public async register(): Promise<void> {
    this.message = '';
    this.loading = true;
    try {
      await this.authService.register(
        this.username.trim(),
        this.password,
        this.role,
        this.company.trim(),
        this.parentCompany.trim()
      );
      this.message = 'Registro completo. Ahora puedes iniciar sesión.';
      this.isRegisterMode = false;
    } catch (error) {
      this.message = (error instanceof Error ? error.message : 'Error de registro');
    } finally {
      this.loading = false;
    }
  }

  public logout(): void {
    this.authService.logout();
    // También actualizamos el logout para que use el router en lugar de recargar
    this.router.navigate(['/login']);
  }
}