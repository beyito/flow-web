import { Routes } from '@angular/router';
import { LoginComponent } from './features/login/login.component';
import { AdminSoftwareComponent } from './features/admin-software/admin-software.component';
import { AdminCompanyComponent } from './features/admin-company/admin-company.component';
import { PolicyDesignerComponent } from './features/policy-designer/components/policy-designer/policy-designer.component';
import { TaskInboxComponent } from './features/execution/components/task-inbox/task-inbox.component';
import { FuncionarioDashboardComponent } from './features/execution/components/funcionario-dashboard/funcionario-dashboard.component';
import { TaskExecutionComponent } from './features/execution/components/task-execution/task-execution.component';

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

  {
    path: 'funcionario-dashboard',
    component: FuncionarioDashboardComponent,
    canActivate: [roleGuard(['FUNCTIONARY', 'FUNCIONARIO', 'COMPANY_ADMIN'])]
  },

  {
    path: 'execution/task/:id',
    component: TaskExecutionComponent,
    canActivate: [roleGuard(['FUNCTIONARY', 'FUNCIONARIO', 'COMPANY_ADMIN'])]
  },

  {
    path: 'bandeja-tareas',
    component: TaskInboxComponent,
    canActivate: [roleGuard(['FUNCTIONARY', 'FUNCIONARIO', 'COMPANY_ADMIN'])]
  },
  
  { path: '**', redirectTo: 'login' }
];
