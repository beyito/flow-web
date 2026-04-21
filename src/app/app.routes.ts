import { Routes } from '@angular/router';
import { LoginComponent } from './features/login/login.component';
import { AdminSoftwareComponent } from './features/admin-software/admin-software.component';
import { AdminLayoutComponent } from './features/admin-layout/admin-layout.component';
import { FuncionariosComponent } from './features/funcionarios/funcionarios.component';
import { PolicyManagerComponent } from './features/policy-manager/policy-manager.component';
import { PolicyDesignerComponent } from './features/policy-designer/components/policy-designer/policy-designer.component';
import { TaskInboxComponent } from './features/execution/components/task-inbox/task-inbox.component';
import { FuncionarioDashboardComponent } from './features/execution/components/funcionario-dashboard/funcionario-dashboard.component';
import { TaskExecutionComponent } from './features/execution/components/task-execution/task-execution.component';
import { roleGuard } from './role.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },

  {
    path: 'admin-software',
    component: AdminSoftwareComponent,
    canActivate: [roleGuard(['SOFTWARE_ADMIN'])]
  },

  {
    path: 'admin',
    component: AdminLayoutComponent,
    canActivate: [roleGuard(['COMPANY_ADMIN'])],
    children: [
      { path: 'funcionarios', component: FuncionariosComponent },
      { path: 'policies', component: PolicyManagerComponent },
      { path: '', redirectTo: 'funcionarios', pathMatch: 'full' }
    ]
  },

  // Compatibilidad con rutas anteriores.
  { path: 'admin-empresa', redirectTo: 'admin/funcionarios', pathMatch: 'full' },
  { path: 'disenador', redirectTo: 'admin/policies', pathMatch: 'full' },

  {
    path: 'designer/:id',
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
