import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-task-execution',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-execution.component.html',
  styleUrl: './task-execution.component.scss'
})
export class TaskExecutionComponent {
  private readonly route = inject(ActivatedRoute);

  public get taskId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }
}
