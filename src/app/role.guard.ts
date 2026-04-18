import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service'; // Ajusta la ruta si es necesario

// Esta es una fábrica de Guards: le pasamos los roles permitidos y nos devuelve un Guard
export function roleGuard(allowedRoles: string[]): CanActivateFn {
  return () => {
    // Usamos inject() para obtener los servicios (esto es propio de Angular moderno)
    const authService = inject(AuthService);
    const router = inject(Router);

    // 1. Si no está logueado, lo mandamos al login inmediatamente
    if (!authService.isAuthenticated()) {
      router.navigate(['/login']);
      return false; // Retornar false bloquea el acceso a la ruta
    }

    // 2. Verificamos si el usuario tiene al menos UNO de los roles permitidos
    const hasRole = allowedRoles.some(role => authService.hasRole(role));

    if (hasRole) {
      return true; // ¡Pase VIP autorizado! La ruta se abre.
    } else {
      // 3. Si está logueado pero es un "curioso" intentando entrar donde no debe,
      // lo devolvemos al login (o podrías crear una ruta '/no-autorizado')
      router.navigate(['/login']);
      return false;
    }
  };
}