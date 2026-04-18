import { CommonModule, NgFor, NgIf } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
// 🚩 IMPORTANTE: Importamos linkTools, elementTools y ui
import { dia, shapes, linkTools, elementTools, ui } from '@joint/plus'; 
import { DiagramCanvasService } from '../../services/diagram-canvas.service';
import { DiagramStorageService } from '../../services/diagram-storage.service';
import { PolicyDataService } from '../../services/policy-data.service';
import { Attachment, Lane, PolicyPayload, PolicySummary, FormField, TaskExecutionOrder } from '../../models/policy-designer.models';
import { LANE_COLORS, NODE_TEMPLATES } from '../../utils/policy-designer.constants';

@Component({
  selector: 'app-policy-designer',
  standalone: true,
  imports: [CommonModule, FormsModule, NgFor, NgIf],
  templateUrl: './policy-designer.component.html',
  styleUrl: './policy-designer.component.scss'
})
export class PolicyDesignerComponent implements OnInit, AfterViewInit {
  @ViewChild('canvas')
  canvas!: ElementRef;

  private readonly policyDataService = inject(PolicyDataService);
  private readonly diagramCanvasService = inject(DiagramCanvasService);
  private readonly diagramStorageService = inject(DiagramStorageService);

  private readonly cdr = inject(ChangeDetectorRef);

  private graph: dia.Graph = this.diagramCanvasService.createGraph();
  private paper: dia.Paper = this.diagramCanvasService.createPaper(this.graph);
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private draggingNodeType: string | null = null;
  
  // 🚩 Variable para controlar el recuadro de redimensionamiento
  private freeTransform: any = null; 

  public readonly nodeTemplates = NODE_TEMPLATES;
  public policies: PolicySummary[] = [];
  public selectedPolicyId: string | null = null;
  public newPolicyName = '';
  public newPolicyDescription = '';
  public infoMessage = 'Cargando politicas...';
  public selectedSourceId: dia.Cell.ID | null = null;
  public selectedTargetId: dia.Cell.ID | null = null;
  public isConnectionMode = false;
  public lanes: Lane[] = [];
  public newLaneName = '';
  public isCanvasDragOver = false;
  public selectedElementId: dia.Cell.ID | null = null;
  public selectedElementType: 'node' | 'link' | null = null;
  public selectedNodeType: string | null = null;
  public selectedTaskFormTitle = '';
  public selectedTaskFormDescription = '';
  public selectedTaskFormFields: FormField[] = [];
  public selectedTaskAttachments: Attachment[] = [];
  public selectedDecisionExpression = '';
  public selectedLinkCondition = '';
  public newFieldLabel = '';
  public newFieldType: FormField['type'] = 'text';
  public newFieldOptions = '';
  public newFieldRequiresAttachment = false;
  public newFieldAttachmentLabel = '';
  public isFormDesignerOpen = false;
  public newElementName = '';
  public isRenaming = false;
  public taskExecutionOrder: TaskExecutionOrder | null = null;
  public showTaskOrder = false;

  public ngOnInit(): void {
    this.registerPaperEvents();
    this.registerGraphEvents();
    this.registerKeyboardEvents();
    void this.initializeDesigner();
  }

  public ngAfterViewInit(): void {
    this.diagramCanvasService.mountPaper(this.canvas, this.paper);
  }

  // ==========================================
  // HERRAMIENTAS VISUALES (NUEVO)
  // ==========================================
  
  private clearTools(): void {
    this.paper.removeTools(); // Borra herramientas de flechas y botones X
    if (this.freeTransform) {
      this.freeTransform.remove(); // Borra el recuadro de redimensionamiento
      this.freeTransform = null;
    }
  }

  private showElementTools(elementView: dia.ElementView): void {
    this.clearTools();

    // 1. Botón de Eliminar (se mantiene igual)
    const toolsView = new dia.ToolsView({
      tools: [
        new elementTools.Remove({
          x: '100%',
          y: 0,
          offset: { x: 5, y: -5 }
        })
      ]
    });
    elementView.addTools(toolsView);

    // 2. Recuadro de Resize (FreeTransform) - CONFIGURACIÓN ACTUALIZADA
    this.freeTransform = new ui.FreeTransform({
      cellView: elementView,
      allowRotation: false,
      
      // 🚩 CAMBIO CLAVE: Permite agrandar horizontal y verticalmente por separado
      preserveAspectRatio: false, 
      
      // Opcional: Define un tamaño mínimo para que el nodo no desaparezca al achicarlo
      minWidth: 50,
      minHeight: 30,
      
      // Opcional: Puedes especificar qué puntos de agarre quieres mostrar
      // 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'
      directions: ['e', 'w', 's', 'n', 'nw', 'ne', 'se', 'sw'] 
    });
    
    this.freeTransform.render();
  }

private showLinkTools(linkView: dia.LinkView): void {
    this.clearTools();

    // 🚩 1. El vector matemático que dibuja un círculo perfecto
    const circlePath = 'M -7 0 a 7 7 0 1 0 14 0 a 7 7 0 1 0 -14 0';

    // 🚩 2. EXTENDEMOS la clase de ORIGEN para obligar a JointJS a usar nuestro diseño
    const CustomSourceArrowhead = linkTools.SourceArrowhead.extend({
      options: {
        markup: [{
          tagName: 'path',
          selector: 'arrowhead', // Nombre estricto interno
          attributes: {
            'd': circlePath,
            'fill': '#38bdf8',       // Azul claro
            'stroke': '#ffffff',     // Borde blanco
            'stroke-width': 2,
            'cursor': 'pointer'
          }
        }]
      }
    });

    // 🚩 3. EXTENDEMOS la clase de DESTINO
    const CustomTargetArrowhead = linkTools.TargetArrowhead.extend({
      options: {
        markup: [{
          tagName: 'path',
          selector: 'arrowhead',
          attributes: {
            'd': circlePath,
            'fill': '#38bdf8',
            'stroke': '#ffffff',
            'stroke-width': 2,
            'cursor': 'pointer'
          }
        }]
      }
    });

    // 4. Inyectamos las herramientas al lienzo
    const toolsView = new dia.ToolsView({
      tools: [
        new linkTools.Vertices(),
        new linkTools.Segments(),
        
        // 🚩 Usamos las nuevas clases extendidas
        new CustomSourceArrowhead(),
        new CustomTargetArrowhead(),
        
        new linkTools.Boundary(),
        new linkTools.Remove({ distance: 20 })
      ]
    });
    
    linkView.addTools(toolsView);
  }
  // ==========================================
  // EVENTOS DEL LIENZO
  // ==========================================

  private registerPaperEvents(): void {
    this.paper.on('element:pointerclick', (cellView: any) => {
      const element = cellView.model as dia.Element;
      const clickedId = element.id;
      const isLane = (element as any).isLaneBackground;

      // Si estamos en MODO CONECTAR, no hacemos nada al clickear una calle
      if (this.isConnectionMode) {
        if (isLane) return; // Ignoramos clics en las calles

        if (!this.selectedSourceId) {
          this.selectedSourceId = clickedId;
          this.selectedTargetId = null;
          this.infoMessage = 'Origen seleccionado. Ahora haz clic en el nodo destino.';
          return;
        }

        if (this.selectedSourceId === clickedId) {
          this.infoMessage = 'Selecciona un nodo distinto como destino.';
          return;
        }

        this.selectedTargetId = clickedId;
        this.createConnectionFromSelection();
      } 
      else {
        // 🚩 MODO NORMAL: Permitimos seleccionar TODO (Nodos y Calles)
        this.selectedSourceId = clickedId;
        this.selectedTargetId = null;
        this.selectElement(clickedId, 'node');
        
        // Mostramos las herramientas de redimensionar y la 'X' roja
        this.showElementTools(cellView);
      }
    });

    this.paper.on('element:pointerdblclick', (cellView: any) => {
      if ((cellView.model as any).isLaneBackground) return; // No renombramos calles con doble clic
      
      const clickedId = (cellView.model as dia.Element).id;
      this.selectElement(clickedId, 'node');
      this.startRenaming();
    });

    this.paper.on('link:pointerclick', (linkView: any) => {
      this.showLinkTools(linkView);
      const linkId = (linkView.model as dia.Link).id;
      this.selectElement(linkId, 'link');
    });

    this.paper.on('element:pointerdown', (cellView: any) => {
      const element = cellView.model;
    // // 🚩 SOLO traemos al frente si NO es una calle
      if (!element.get('isLaneBackground')) {
        element.toFront(); 
      } else {
        // Si es una calle, nos aseguramos de que se mantenga al fondo
        element.toBack(); 
      }
    });
    

    this.paper.on('blank:pointerdown', () => {
      
      this.clearTools(); 
      this.selectedElementId = null;
      this.selectedElementType = null;
      this.selectedNodeType = null;
      this.isRenaming = false;
      this.clearSelection();
      this.refreshView();
    });
  }

  private registerGraphEvents(): void {
    this.graph.on('change:size', (element: dia.Element, newSize: dia.Size) => {
  if (element.get('isLaneBackground')) {
    const children = element.getEmbeddedCells();
    children.forEach(child => {
      // Ajustamos el ancho del cuerpo al mismo ancho de la cabecera
      if (child.isElement()) {
        child.resize(newSize.width, 800 - newSize.height);
      }
    });
  }
});
    this.graph.on('add remove change', () => this.scheduleLocalSave());
    
    // 🚩 LIMPIEZA DE ESTADO: Si borras con la 'X' roja, Angular limpia el sidebar
    this.graph.on('remove', (cell: dia.Cell) => {
      if (this.selectedElementId === cell.id) {
        this.selectedElementId = null;
        this.selectedElementType = null;
        this.isRenaming = false;
        this.clearSelection();
      }
    });

    
  }

  private registerKeyboardEvents(): void {
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Delete' && this.selectedElementId) {
        this.deleteElement();
      }
      if (event.key === 'Escape') {
        this.isRenaming = false;
        this.selectedElementId = null;
        this.selectedElementType = null;
        this.clearTools();
      }
    });
  }

  // ==========================================
  // RESTO DEL CÓDIGO (Data, CRUD y Métodos)
  // ==========================================

  public deleteElement(): void {
    this.clearTools(); // 🚩 Ocultamos el recuadro visual antes de eliminar de memoria
    if (!this.selectedElementId) {
      this.infoMessage = 'No hay elemento seleccionado para eliminar.';
      return;
    }

    this.diagramCanvasService.deleteElement(this.graph, this.selectedElementId);
    this.selectedElementId = null;
    this.selectedElementType = null;
    this.selectedNodeType = null;
    this.isRenaming = false;
    this.infoMessage = 'Elemento eliminado.';
    this.scheduleLocalSave();
  }

  public async loadPolicyList(): Promise<void> {
    try {
      this.policies = await this.policyDataService.getAllPolicies();
      this.infoMessage = 'Lista de politicas cargada.';
      
      // 🚩 AÑADE ESTA LÍNEA PARA FORZAR EL RENDERIZADO
      this.cdr.detectChanges(); 
      
    } catch (error) {
      this.infoMessage = `Error cargando politicas: ${error}`;
      this.cdr.detectChanges(); // También es buena práctica ponerlo en el error
    }
  }
  public async onPolicySelect(event: Event): Promise<void> {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedPolicyId = value || null;
    this.infoMessage = this.selectedPolicyId
      ? `Politica seleccionada: ${this.selectedPolicyId}`
      : 'Selecciona una politica para continuar.';
  }

  public async loadPolicy(): Promise<void> {
    if (!this.selectedPolicyId) {
      this.infoMessage = 'Selecciona una politica antes de cargar.';
      return;
    }

    try {
      const policy = await this.policyDataService.getPolicyById(this.selectedPolicyId);

      if (!policy) {
        this.infoMessage = 'Politica no encontrada.';
        return;
      }

      this.applyPolicy(policy);
      this.infoMessage = `Diagrama de politica ${policy.name} cargado.`;
    } catch (error) {
      this.infoMessage = `Error al cargar politica: ${error}`;
    }
  }

  public async createPolicy(): Promise<void> {
    if (!this.newPolicyName.trim()) {
      this.infoMessage = 'Debes ingresar un nombre para la politica.';
      return;
    }

    try {
      const createdPolicy = await this.policyDataService.createPolicy(this.newPolicyName.trim(), this.newPolicyDescription.trim());
      this.selectedPolicyId = createdPolicy.id;
      this.newPolicyName = '';
      this.newPolicyDescription = '';
      this.resetDesignerState(false);
      await this.loadPolicyList();
      this.infoMessage = `Politica creada: ${createdPolicy.name}`;
    } catch (error) {
      this.infoMessage = `Error creando politica: ${error}`;
    }
  }

  public async savePolicyGraph(): Promise<void> {
    if (!this.selectedPolicyId) {
      this.infoMessage = 'Selecciona una politica antes de guardar.';
      return;
    }

    try {
      const graphJson = JSON.stringify(this.diagramCanvasService.getPersistedGraphJSON(this.graph));
      await this.policyDataService.updatePolicyDiagram(this.selectedPolicyId, graphJson, this.lanes);
      this.infoMessage = 'Diagrama guardado correctamente en MongoDB.';
    } catch (error) {
      this.infoMessage = `Error guardando diagrama: ${error}`;
    }
  }

  public addLane(): void {
    if (!this.newLaneName.trim()) {
      this.infoMessage = 'Debes ingresar un nombre para la calle.';
      return;
    }

    const lane: Lane = {
      id: `lane-${Date.now()}`,
      name: this.newLaneName.trim(),
      color: LANE_COLORS[this.lanes.length % LANE_COLORS.length],
      x: 0
    };

    this.lanes = this.diagramCanvasService.recalculateLanePositions([...this.lanes, lane]);
    this.newLaneName = '';
    this.diagramCanvasService.renderLaneBackgrounds(this.graph, this.lanes);
    this.infoMessage = `Calle "${lane.name}" agregada.`;
    this.scheduleLocalSave();
  }

  public removeLane(laneId: string): void {
    this.lanes = this.diagramCanvasService.recalculateLanePositions(this.lanes.filter((lane) => lane.id !== laneId));
    this.diagramCanvasService.renderLaneBackgrounds(this.graph, this.lanes);
    this.infoMessage = 'Calle eliminada.';
    this.scheduleLocalSave();
  }

  public addNode(type: string, label: string, x?: number, y?: number): void {
    const nodeSize = this.diagramCanvasService.getNodeSize(type);
    const posX = this.diagramCanvasService.clampNodeX(x ?? 80, nodeSize.width);
    const posY = this.diagramCanvasService.clampNodeY(y ?? 80, nodeSize.height);
    const shape = this.diagramCanvasService.createShape(type, label, posX, posY);

    (shape as any).nodeType = type;
    (shape as any).laneId = this.diagramCanvasService.getLaneIdByX(this.lanes, posX + nodeSize.width / 2) ?? 'default';

    this.graph.addCell(shape);

    // Crear conexiones automáticas para elementos de sincronización
    if (type === 'FORK') {
      this.createForkConnections(shape);
    } else if (type === 'SYNCHRONIZATION') {
      this.createSynchronizationConnections(shape);
    }

    this.infoMessage = `Nodo "${label}" agregado al lienzo.`;
  }

  private createForkConnections(forkNode: dia.Element): void {
    // Crear 2 conexiones salientes desde el FORK
    const forkX = forkNode.position().x;
    const forkY = forkNode.position().y;
    const forkWidth = forkNode.size().width;
    const forkHeight = forkNode.size().height;

    // Calcular posiciones asegurando que queden dentro del canvas
    const targetX = Math.min(forkX + forkWidth + 50, this.diagramCanvasService.getCanvasWidth() - 150);
    const targetY1 = Math.max(forkY - 80, 54);
    const targetY2 = Math.min(forkY + forkHeight + 10, this.diagramCanvasService.getCanvasHeight() - 80);

    // Primera conexión hacia arriba
    const target1 = this.diagramCanvasService.createShape('TASK', 'Tarea 1', targetX, targetY1);
    (target1 as any).nodeType = 'TASK';
    (target1 as any).laneId = this.diagramCanvasService.getLaneIdByX(this.lanes, targetX) ?? 'default';
    this.graph.addCell(target1);

    const link1 = this.diagramCanvasService.createLink(forkNode, target1);
    this.graph.addCell(link1);

    // Segunda conexión hacia abajo (solo si hay espacio suficiente)
    if (targetY2 - targetY1 > 100) {
      const target2 = this.diagramCanvasService.createShape('TASK', 'Tarea 2', targetX, targetY2);
      (target2 as any).nodeType = 'TASK';
      (target2 as any).laneId = this.diagramCanvasService.getLaneIdByX(this.lanes, targetX) ?? 'default';
      this.graph.addCell(target2);

      const link2 = this.diagramCanvasService.createLink(forkNode, target2);
      this.graph.addCell(link2);
    }
  }

  private createSynchronizationConnections(syncNode: dia.Element): void {
    // Crear 2 conexiones entrantes hacia la SYNCHRONIZATION
    const syncX = syncNode.position().x;
    const syncY = syncNode.position().y;
    const syncHeight = syncNode.size().height;

    // Calcular posiciones asegurando que queden dentro del canvas
    const sourceX = Math.max(syncX - 200, 10);
    const sourceY1 = Math.max(syncY - 80, 54);
    const sourceY2 = Math.min(syncY + syncHeight + 10, this.diagramCanvasService.getCanvasHeight() - 80);

    // Primera conexión desde arriba
    const source1 = this.diagramCanvasService.createShape('TASK', 'Tarea A', sourceX, sourceY1);
    (source1 as any).nodeType = 'TASK';
    (source1 as any).laneId = this.diagramCanvasService.getLaneIdByX(this.lanes, sourceX) ?? 'default';
    this.graph.addCell(source1);

    const link1 = this.diagramCanvasService.createLink(source1, syncNode);
    this.graph.addCell(link1);

    // Segunda conexión desde abajo (solo si hay espacio suficiente)
    if (sourceY2 - sourceY1 > 100) {
      const source2 = this.diagramCanvasService.createShape('TASK', 'Tarea B', sourceX, sourceY2);
      (source2 as any).nodeType = 'TASK';
      (source2 as any).laneId = this.diagramCanvasService.getLaneIdByX(this.lanes, sourceX) ?? 'default';
      this.graph.addCell(source2);

      const link2 = this.diagramCanvasService.createLink(source2, syncNode);
      this.graph.addCell(link2);
    }
  }

  public startDraggingNode(nodeType: string, label: string, event: DragEvent): void {
    if (event.dataTransfer) {
      event.dataTransfer.setData('application/flow-node-type', nodeType);
      event.dataTransfer.setData('application/flow-node-label', label);
      event.dataTransfer.effectAllowed = 'copy';
      this.isCanvasDragOver = false;
      return;
    }

    this.draggingNodeType = nodeType;
    const nodeSize = this.diagramCanvasService.getNodeSize(nodeType);
    const dragElement = document.createElement('div');
    dragElement.style.position = 'fixed';
    dragElement.style.pointerEvents = 'none';
    dragElement.style.background = '#3b82f6';
    dragElement.style.borderRadius = '4px';
    dragElement.style.padding = '8px 12px';
    dragElement.style.color = 'white';
    dragElement.style.fontSize = '12px';
    dragElement.style.zIndex = '10000';
    dragElement.textContent = label;
    document.body.appendChild(dragElement);

    const moveHandler = (moveEvent: MouseEvent) => {
      dragElement.style.left = `${moveEvent.clientX - nodeSize.width / 2}px`;
      dragElement.style.top = `${moveEvent.clientY - nodeSize.height / 2}px`;
    };

    const upHandler = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
      dragElement.remove();

      const paperRect = this.diagramCanvasService.getCanvasRect(this.paper);
      if (
        upEvent.clientX >= paperRect.left &&
        upEvent.clientX <= paperRect.right &&
        upEvent.clientY >= paperRect.top &&
        upEvent.clientY <= paperRect.bottom &&
        this.draggingNodeType
      ) {
        const offsetX = upEvent.clientX - paperRect.left;
        const offsetY = upEvent.clientY - paperRect.top;
        this.addNode(this.draggingNodeType, label, offsetX, offsetY);
      }

      this.draggingNodeType = null;
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  public onCanvasDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.isCanvasDragOver = true;
  }

  public onCanvasDragLeave(): void {
    this.isCanvasDragOver = false;
  }

  public onCanvasDrop(event: DragEvent): void {
    event.preventDefault();
    this.isCanvasDragOver = false;

    if (!event.dataTransfer) {
      return;
    }

    const nodeType = event.dataTransfer.getData('application/flow-node-type');
    const label = event.dataTransfer.getData('application/flow-node-label');
    if (!nodeType || !label) {
      return;
    }

    const canvasRect = this.canvas.nativeElement.getBoundingClientRect();
    const nodeSize = this.diagramCanvasService.getNodeSize(nodeType);
    const x = event.clientX - canvasRect.left - nodeSize.width / 2;
    const y = event.clientY - canvasRect.top - nodeSize.height / 2;
    this.addNode(nodeType, label, x, y);
  }

  public connectSelected(): void {
    this.isConnectionMode = !this.isConnectionMode;
    if (!this.isConnectionMode) {
      this.clearSelection();
      this.infoMessage = 'Modo conexion desactivado.';
      return;
    }

    this.selectedSourceId = null;
    this.selectedTargetId = null;
    this.infoMessage = 'Modo conexion activado. Selecciona el nodo origen y luego el nodo destino.';
  }

  public clearSelection(): void {
    this.selectedSourceId = null;
    this.selectedTargetId = null;
    this.infoMessage = 'Seleccion reseteada.';
  }

  public selectElement(elementId: dia.Cell.ID, type: 'node' | 'link'): void {
    this.selectedElementId = elementId;
    this.selectedElementType = type;
    this.isRenaming = false;
    const element = this.graph.getCell(elementId);
    if (element && type === 'node') {
      this.newElementName = (element as any).attr('label/text') || '';
      this.selectedNodeType = element.get('nodeType') ?? null;
      this.loadSelectedNodeMetadata(element as dia.Element);
      this.infoMessage = `Nodo seleccionado: "${this.newElementName}"`;
    } else if (element && element.isLink()) {
      this.selectedNodeType = null;
      this.selectedLinkCondition = element.get('conditionLabel') ?? '';
      this.infoMessage = 'Flecha seleccionada.';
    }
    this.refreshView();
  }

  public startRenaming(): void {
    if (this.selectedElementType !== 'node') {
      this.infoMessage = 'Solo puedes renombrar nodos.';
      return;
    }
    this.isRenaming = true;
  }

  public confirmRename(): void {
    if (!this.selectedElementId || !this.isRenaming) {
      return;
    }

    const element = this.graph.getCell(this.selectedElementId) as dia.Element;
    if (!element || element.isLink()) {
      return;
    }

    this.diagramCanvasService.updateNodeLabel(element, this.newElementName);
    this.isRenaming = false;
    this.infoMessage = `Nodo renombrado a "${this.newElementName}".`;
    this.scheduleLocalSave();
  }

  public cancelRename(): void {
    this.isRenaming = false;
    this.infoMessage = 'Renombrado cancelado.';
  }

  private refreshView(): void {
    this.cdr.detectChanges();
  }

  private loadSelectedNodeMetadata(element: dia.Element): void {
    const nodeMeta = element.get('nodeMeta') ?? {};
    this.selectedTaskFormTitle = nodeMeta.taskForm?.title ?? '';
    this.selectedTaskFormDescription = nodeMeta.taskForm?.description ?? '';
    this.selectedTaskFormFields = [...(nodeMeta.taskForm?.fields ?? [])];
    this.selectedTaskAttachments = [...(nodeMeta.taskForm?.attachments ?? [])];
    this.selectedDecisionExpression = nodeMeta.decisionExpression ?? '';
  }

  public applySelectedNodeMetadata(): void {
    if (!this.selectedElementId || this.selectedElementType !== 'node') {
      return;
    }

    const element = this.graph.getCell(this.selectedElementId) as dia.Element;
    if (!element || element.isLink()) {
      return;
    }

    const nodeType = element.get('nodeType');
    const nodeMeta: any = element.get('nodeMeta') ?? {};

    if (nodeType === 'TASK') {
      nodeMeta.taskForm = {
        title: this.selectedTaskFormTitle,
        description: this.selectedTaskFormDescription,
        fields: [...this.selectedTaskFormFields],
        attachments: [...this.selectedTaskAttachments]
      };
    }

    if (nodeType === 'DECISION') {
      nodeMeta.decisionExpression = this.selectedDecisionExpression;
    }

    element.set('nodeMeta', nodeMeta);
    this.scheduleLocalSave();
  }

  public addTaskField(): void {
    const label = this.newFieldLabel.trim();
    if (!label) {
      this.infoMessage = 'Ingresa el nombre de la pregunta antes de agregar.';
      return;
    }

    const options = this.newFieldType === 'select' || this.newFieldType === 'checkbox'
      ? this.newFieldOptions.split(',').map(opt => opt.trim()).filter(opt => opt)
      : undefined;

    const newField: FormField = {
      id: `field-${Date.now()}`,
      type: this.newFieldType,
      label,
      placeholder: '',
      required: false,
      options,
      requiresAttachment: this.newFieldRequiresAttachment,
      attachmentLabel: this.newFieldRequiresAttachment ? this.newFieldAttachmentLabel : undefined
    };

    this.selectedTaskFormFields.push(newField);
    this.resetNewFieldForm();
    this.applySelectedNodeMetadata();
  }

  public removeTaskField(index: number): void {
    this.selectedTaskFormFields.splice(index, 1);
    this.applySelectedNodeMetadata();
  }

  public updateTaskField(index: number, field: FormField): void {
    this.selectedTaskFormFields[index] = { ...field };
    this.applySelectedNodeMetadata();
  }

  private resetNewFieldForm(): void {
    this.newFieldLabel = '';
    this.newFieldType = 'text';
    this.newFieldOptions = '';
    this.newFieldRequiresAttachment = false;
    this.newFieldAttachmentLabel = '';
  }

  public toggleFormDesigner(): void {
    this.isFormDesignerOpen = !this.isFormDesignerOpen;
  }

  public getFieldTypeLabel(type: FormField['type']): string {
    const labels = {
      text: 'Texto',
      textarea: 'Texto largo',
      number: 'Número',
      date: 'Fecha',
      select: 'Selección',
      checkbox: 'Múltiple',
      file: 'Archivo'
    };
    return labels[type] || type;
  }

  public async getTaskExecutionOrder(): Promise<void> {
    if (!this.selectedPolicyId) {
      this.infoMessage = 'Selecciona una politica antes de ver el orden de tareas.';
      return;
    }

    try {
      this.taskExecutionOrder = await this.policyDataService.getTaskExecutionOrder(this.selectedPolicyId);
      this.showTaskOrder = true;
      this.infoMessage = `Orden de tareas calculado para "${this.taskExecutionOrder?.policyName}".`;
    } catch (error) {
      this.infoMessage = `Error al calcular el orden de tareas: ${error}`;
      this.taskExecutionOrder = null;
      this.showTaskOrder = false;
    }
  }

  public hideTaskOrder(): void {
    this.showTaskOrder = false;
    this.taskExecutionOrder = null;
  }

  public editField(index: number): void {
    // Por ahora solo mostramos un mensaje, pero podríamos implementar edición inline
    this.infoMessage = `Para editar "${this.selectedTaskFormFields[index].label}", elimina y vuelve a crear el campo.`;
  }

  public async onTaskAttachmentChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      return;
    }

    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i];
      const dataUrl = await this.readFileAsDataURL(file);

      this.selectedTaskAttachments.push({
        id: `${Date.now()}-${i}-${file.name}`,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl
      });
    }

    input.value = '';
    this.applySelectedNodeMetadata();
  }

  public removeAttachment(index: number): void {
    this.selectedTaskAttachments.splice(index, 1);
    this.applySelectedNodeMetadata();
  }

  private readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  public applySelectedLinkCondition(): void {
    if (!this.selectedElementId || this.selectedElementType !== 'link') {
      return;
    }

    const link = this.graph.getCell(this.selectedElementId) as dia.Link;
    if (!link || !link.isLink()) {
      return;
    }

    this.diagramCanvasService.updateLinkCondition(link, this.selectedLinkCondition);
    this.scheduleLocalSave();
  }

  public newDiagram(): void {
    this.selectedPolicyId = null;
    this.resetDesignerState(true);
    this.infoMessage = 'Nuevo diagrama creado.';
  }

  private async initializeDesigner(): Promise<void> {
    await this.loadPolicyList();
    this.restoreFromLocalStorage();
  }

  private createConnectionFromSelection(): void {
    if (!this.selectedSourceId || !this.selectedTargetId) {
      return;
    }

    const source = this.graph.getCell(this.selectedSourceId) as dia.Element;
    const target = this.graph.getCell(this.selectedTargetId) as dia.Element;
    if (!source || !target) {
      this.infoMessage = 'No se encontro uno de los nodos en el modelo.';
      return;
    }

    if (this.diagramCanvasService.hasExistingLink(this.graph, source.id, target.id)) {
      this.selectedSourceId = null;
      this.selectedTargetId = null;
      this.infoMessage = 'Ese enlace ya existe. Selecciona un nuevo origen.';
      return;
    }

    let conditionLabel: string | undefined;
    if (source.get('nodeType') === 'DECISION') {
      const outboundLinks = this.graph.getLinks().filter((link) => link.get('source')?.id === source.id).length;
      conditionLabel = outboundLinks === 0 ? 'Sí' : outboundLinks === 1 ? 'No' : undefined;
    }

    const link = this.diagramCanvasService.createLink(source, target, conditionLabel);
    this.graph.addCell(link);
    this.selectedSourceId = null;
    this.selectedTargetId = null;
    this.infoMessage = 'Flecha creada con exito. Puedes seleccionar otro origen.';
  }

  private applyPolicy(policy: PolicyPayload): void {
    this.selectedSourceId = null;
    this.selectedTargetId = null;
    this.isConnectionMode = false;
    this.lanes = this.diagramCanvasService.recalculateLanePositions(policy.lanes ?? []);
    this.diagramCanvasService.renderPolicy(this.graph, policy, this.lanes);
    this.diagramStorageService.clear();
  }

  private restoreFromLocalStorage(): void {
    const state = this.diagramStorageService.load();
    if (!state) {
      return;
    }

    try {
      this.selectedPolicyId = state.policyId;
      this.isConnectionMode = false;
      this.lanes = this.diagramCanvasService.recalculateLanePositions(state.lanes ?? []);
      this.graph.clear();
      this.diagramCanvasService.renderLaneBackgrounds(this.graph, this.lanes);

      if (state.diagramJson) {
        const graphData = this.diagramCanvasService.sanitizeGraphJSON(JSON.parse(state.diagramJson));
        this.graph.fromJSON(graphData);
      }

      this.infoMessage = 'Diagrama restaurado desde localStorage.';
    } catch {
      this.diagramStorageService.clear();
    }
  }

  private resetDesignerState(clearStorage: boolean): void {
    this.graph.clear();
    this.diagramCanvasService.clearLaneBackgrounds();
    this.lanes = [];
    this.selectedSourceId = null;
    this.selectedTargetId = null;
    this.isConnectionMode = false;
    if (clearStorage) {
      this.diagramStorageService.clear();
    }
  }

  private scheduleLocalSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.diagramStorageService.save(this.selectedPolicyId, this.graph, this.lanes);
    }, 500);
  }

  public trackByFieldId(index: number, field: FormField): string {
    return field.id;
  }

  public trackByTaskId(index: number, task: any): string {
    return task.nodeId;
  }

  public getDependencyLabels(dependencyIds: string[]): string {
    if (!this.taskExecutionOrder) return '';

    return dependencyIds.map(id => {
      const task = this.taskExecutionOrder!.tasks.find(t => t.nodeId === id);
      return task ? task.nodeLabel : id;
    }).join(', ');
  }
}