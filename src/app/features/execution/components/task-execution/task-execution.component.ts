import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core'; // 🚩 Importamos ChangeDetectorRef
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ExecutionService } from '../../services/execution.service';
import { TaskDetailDto, TaskFormField, TaskStatus } from '../../models/execution.models';

type DynamicFormGroup = FormGroup<Record<string, FormControl>>;

@Component({
  selector: 'app-task-execution',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './task-execution.component.html',
  styleUrl: './task-execution.component.scss'
})
export class TaskExecutionComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly executionService = inject(ExecutionService);
  private readonly cdr = inject(ChangeDetectorRef); // 🚩 Inyectamos el detector de cambios

  public loading = false;
  public takingTask = false;
  public completingTask = false;
  public message = '';
  public taskDetail: TaskDetailDto | null = null;
  public formSchemaFields: TaskFormField[] = [];
  public formGroup: DynamicFormGroup = this.fb.group({}) as DynamicFormGroup;
  public formReady = false;
  public savedAnswers: Record<string, unknown> = {};

  public ngOnInit(): void {
    void this.loadTaskDetails();
  }

  public get taskId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  public get status(): TaskStatus | '' {
    return this.taskDetail?.status ?? '';
  }

  public async loadTaskDetails(): Promise<void> {
    if (!this.taskId) {
      this.message = 'No se encontro una tarea para ejecutar.';
      this.cdr.detectChanges(); // 🚩 Actualizamos vista
      return;
    }

    this.loading = true;
    this.message = '';
    this.formReady = false;
    this.cdr.detectChanges(); // 🚩 Avisamos que empezamos a cargar

    try {
      const detail = await this.executionService.getTaskDetails(this.taskId);
      this.taskDetail = detail;
      this.formSchemaFields = this.parseSchema(detail.formSchema);
      this.formGroup = this.buildForm(this.formSchemaFields);
      this.formReady = true;
      this.savedAnswers = this.parseFormData(detail.formData);
      console.log('Task details loaded:', { detail, formSchemaFields: this.formSchemaFields, savedAnswers: this.savedAnswers });
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo cargar el detalle de la tarea';
    } finally {
      this.loading = false;
      this.cdr.detectChanges(); // 🚩 LA SOLUCIÓN: Despierta Angular, la carga terminó
    }
  }

  public async markAsInProgress(): Promise<void> {
    if (!this.taskDetail || this.taskDetail.status !== 'PENDING') {
      return;
    }
    this.takingTask = true;
    this.message = '';
    this.cdr.detectChanges(); // 🚩 Actualizamos estado del botón

    try {
      await this.executionService.takeTask(this.taskDetail.id);
      await this.loadTaskDetails(); // Esto ya trae su propio detectChanges
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo tomar la tarea';
    } finally {
      this.takingTask = false;
      this.cdr.detectChanges(); // 🚩 Actualizamos vista
    }
  }

  public async submitTask(): Promise<void> {
    // Protección doble: si el formulario es inválido, no hacemos nada
    if (this.formGroup.invalid) {
      this.formGroup.markAllAsTouched(); // Marca todos para que aparezcan los mensajes de error en rojo
      this.message = 'Existen campos obligatorios sin completar.';
      this.cdr.detectChanges();
      return;
    }

    this.completingTask = true;
    this.message = '';
    this.cdr.detectChanges();

    try {
      // Extraemos los valores limpios del formulario
      const payload = JSON.stringify(this.formGroup.getRawValue());
      await this.executionService.completeTask(this.taskDetail!.id, payload);
      await this.router.navigate(['/funcionario-dashboard']);
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Error al finalizar la tarea';
    } finally {
      this.completingTask = false;
      this.cdr.detectChanges();
    }
  }

  public saveProgress(): void {
    this.message = 'Progreso guardado localmente (no persistente).';
    this.cdr.detectChanges(); // 🚩 Actualizamos mensaje
  }

  // ... (tus demás métodos se quedan igual)
  public statusLabel(status: string): string { /* ... */ return ''; }
  public statusClass(status: string): string { /* ... */ return ''; }
  public fieldName(field: TaskFormField, index: number): string {
    if (!field) return `field_${index}`;
    // Intentamos buscar name, si no existe buscamos id, si no, usamos el índice
    const nameStr = field.name || field.id || `field_${index}`;
    return nameStr.trim();
  }
  public getFieldControl(field: TaskFormField, index: number): FormControl | null { /* ... */ return null; }
  public shouldShowError(field: TaskFormField, index: number): boolean { /* ... */ return false; }
  private buildForm(fields: TaskFormField[]): DynamicFormGroup {
    const controls: Record<string, FormControl> = {};

    fields.forEach((field, index) => {
      const controlName = this.fieldName(field, index);
      const isRequired = true;
      const isBooleanField = field.type === 'checkbox' || field.type === 'boolean';

      controls[controlName] = this.fb.control(
        isBooleanField ? false : '',
        isRequired
          ? [isBooleanField ? Validators.requiredTrue : Validators.required]
          : []
      ) as FormControl;
    });

    return this.fb.group(controls) as DynamicFormGroup;
  }
  private parseSchema(rawSchema: string): TaskFormField[] {
    if (!rawSchema || !rawSchema.trim()) {
      return [];
    }
    try {
      // Primer intento de parseo
      let parsed = JSON.parse(rawSchema);
      
      // 🚩 Si el backend lo envió "doblemente" stringificado, lo parseamos de nuevo
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }

      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error al parsear formSchema:', error);
      return [];
    }
  }

  private parseFormData(rawFormData?: string | null): Record<string, unknown> {
    if (!rawFormData || !rawFormData.trim()) {
      return {};
    }
    try {
      let parsed = JSON.parse(rawFormData);
      
      // 🚩 Misma protección para las respuestas guardadas
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }

      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      console.error('Error al parsear formData:', error);
      return {};
    }
  }
}
