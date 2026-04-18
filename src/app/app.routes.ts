import { Routes } from '@angular/router';
import { LoginComponent } from './features/login/login.component';
import { AdminSoftwareComponent } from './features/admin-software/admin-software.component';
import { AdminCompanyComponent } from './features/admin-company/admin-company.component';
import { PolicyDesignerComponent } from './features/policy-designer/components/policy-designer/policy-designer.component';

// IMPORTAMOS NUESTRO GUARD
import { roleGuard } from './role.guard'; 

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  
  // RUTA RESTRINGIDA: Solo SOFTWARE_ADMIN
  { 
    path: 'admin-software', 
    component: AdminSoftwareComponent,
    canActivate: [roleGuard(['SOFTWARE_ADMIN'])] 
  },
  
  // RUTA RESTRINGIDA: Solo COMPANY_ADMIN
  { 
    path: 'admin-empresa', 
    component: AdminCompanyComponent,
    canActivate: [roleGuard(['COMPANY_ADMIN'])] 
  },
  
  // RUTA RESTRINGIDA: Solo FUNCTIONARY
  // (Si quieres que el admin también pueda entrar, pondrías: ['FUNCTIONARY', 'COMPANY_ADMIN'])
  { 
    path: 'disenador', 
    component: PolicyDesignerComponent,
    canActivate: [roleGuard(['COMPANY_ADMIN'])] 
  },
  
  { path: '**', redirectTo: 'login' }
];