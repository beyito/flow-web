import { Component } from '@angular/core';
import { PolicyDesignerComponent } from './features/policy-designer/components/policy-designer/policy-designer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PolicyDesignerComponent],
  template: '<app-policy-designer />'
})
export class App {}
