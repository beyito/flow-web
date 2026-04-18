import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  private readonly authService = new AuthService();

  public username = '';
  public password = '';
  public company = '';
  public parentCompany = '';
  public role: 'SOFTWARE_ADMIN' | 'FUNCTIONARY' = 'FUNCTIONARY';
  public isRegisterMode = false;
  public message = '';
  public loading = false;

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
      await this.authService.login(this.username.trim(), this.password);
      window.location.reload();
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
    window.location.reload();
  }
}
