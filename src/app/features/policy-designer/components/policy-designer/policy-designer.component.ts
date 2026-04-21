import { CommonModule, NgFor, NgIf } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
// 🚩 IMPORTANTE: Importamos linkTools, elementTools y ui
import { dia, shapes, linkTools, elementTools, ui } from '@joint/plus'; 
import { StompSubscription } from '@stomp/stompjs';
import { DiagramCanvasService } from '../../services/diagram-canvas.service';
import { DiagramStorageService } from '../../services/diagram-storage.service';
import { PolicyDataService } from '../../services/policy-data.service';
import { WebSocketService } from '../../services/web-socket.service';
import { Attachment, CompanyArea, Lane, PolicyPayload, FormField, TaskExecutionOrder } from '../../models/policy-designer.models';
import { DiagramEvent } from '../../models/diagram-event.model';
import { NODE_TEMPLATES } from '../../utils/policy-designer.constants';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CompanyAreaService } from '../../services/company-area.service';

@Component({
  selector: 'app-policy-designer',
  standalone: true,
  imports: [CommonModule, FormsModule, NgFor, NgIf, RouterModule],
  templateUrl: './policy-designer.component.html',
  styleUrl: './policy-designer.component.scss'
})
export class PolicyDesignerComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvas')
  canvas!: ElementRef;

  private readonly policyDataService = inject(PolicyDataService);
  private readonly diagramCanvasService = inject(DiagramCanvasService);
  private readonly diagramStorageService = inject(DiagramStorageService);
  private readonly companyAreaService = inject(CompanyAreaService);
  private readonly webSocketService = inject(WebSocketService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private graph: dia.Graph = this.diagramCanvasService.createGraph();
  private paper: dia.Paper = this.diagramCanvasService.createPaper(this.graph);
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  private autoSaveInFlight = false;
  private pendingAutoSave = false;
  private suppressAutoSave = false;
  private draggingNodeType: string | null = null;
  private policySubscription: StompSubscription | null = null;
  private cellSyncTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private isRemoteChange = false;
  private readonly clientId = crypto.randomUUID();
  
  // 🚩 Variable para controlar el recuadro de redimensionamiento
  private freeTransform: any = null; 

  public readonly nodeTemplates = NODE_TEMPLATES;
  public policyName = '';
  public selectedPolicyId: string | null = null;
  public infoMessage = 'Cargando politica...';
  public selectedSourceId: dia.Cell.ID | null = null;
  public selectedTargetId: dia.Cell.ID | null = null;
  public isConnectionMode = false;
  public lanes: Lane[] = [];
  public availableAreas: CompanyArea[] = [];
  public selectedAreaId = '';
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
    this.route.paramMap.subscribe((params) => {
      void this.loadPolicyFromRoute(params.get('id'));
    });
  }

  public ngAfterViewInit(): void {
    this.diagramCanvasService.mountPaper(this.canvas, this.paper);
  }

  public ngOnDestroy(): void {
    this.cellSyncTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this.cellSyncTimeouts.clear();
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
      this.autoSaveTimeout = null;
    }
    this.policySubscription?.unsubscribe();
    this.webSocketService.disconnect();
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
        return;
      }

      this.scheduleCellRealtimeSync(element, 0);
    });
    this.graph.on('add remove change', () => {
      this.scheduleLocalSave();
      if (!this.isRemoteChange && !this.suppressAutoSave) {
        this.scheduleAutoSave();
      }
    });
    this.graph.on('add', (cell: dia.Cell) => {
      if (this.isRemoteChange || !this.selectedPolicyId) {
        return;
      }

      const event: DiagramEvent = {
        action: 'add',
        cellId: String(cell.id),
        payload: {
          cell: cell.toJSON(),
          clientId: this.clientId
        }
      };

      this.webSocketService.sendMessage(this.selectedPolicyId, event);
    });

    this.graph.on('remove', (cell: dia.Cell) => {
      if (this.isRemoteChange || !this.selectedPolicyId) {
        return;
      }

      const event: DiagramEvent = {
        action: 'remove',
        cellId: String(cell.id),
        payload: {
          clientId: this.clientId
        }
      };

      this.webSocketService.sendMessage(this.selectedPolicyId, event);
    });

    this.graph.on('change:position', (cell: dia.Cell) => {
      if (this.isRemoteChange || !this.selectedPolicyId || !cell.isElement()) {
        return;
      }

      const element = cell as dia.Element;
      const position = element.position();
      const event: DiagramEvent = {
        action: 'move',
        cellId: String(element.id),
        payload: {
          x: position.x,
          y: position.y,
          clientId: this.clientId
        }
      };

      this.webSocketService.sendMessage(this.selectedPolicyId, event);
    });
    
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

  public goBackToPanel(): void {
    void this.router.navigate(['/admin/policies']);
  }

  public addLane(): void {
    if (!this.selectedAreaId) {
      this.infoMessage = 'Debes seleccionar un area para agregar una calle.';
      return;
    }

    const selectedArea = this.availableAreas.find((area) => area.id === this.selectedAreaId);
    if (!selectedArea) {
      this.infoMessage = 'El area seleccionada no es valida.';
      return;
    }

    const laneId = selectedArea.name;
    if (this.lanes.some((lane) => lane.id === laneId)) {
      this.infoMessage = `La calle "${selectedArea.name}" ya fue agregada.`;
      return;
    }

    const lane: Lane = {
      id: laneId,
      name: selectedArea.name,
      color: selectedArea.color,
      x: 0
    };

    this.lanes = this.diagramCanvasService.recalculateLanePositions([...this.lanes, lane]);
    this.diagramCanvasService.renderLaneBackgrounds(this.graph, this.lanes);
    this.selectedAreaId = '';
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
    this.scheduleCellRealtimeSync(element);
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
    this.scheduleCellRealtimeSync(element);
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
    this.scheduleCellRealtimeSync(link);
  }

  private async loadPolicyFromRoute(policyId: string | null): Promise<void> {
    if (!policyId) {
      this.infoMessage = 'No se encontro el id de la politica en la URL.';
      return;
    }

    this.policySubscription?.unsubscribe();
    this.selectedPolicyId = policyId;

    try {
      await this.loadCompanyAreas();
      const policy = await this.policyDataService.getPolicyById(policyId);

      if (!policy) {
        this.infoMessage = `Politica no encontrada para el id ${policyId}.`;
        return;
      }

      this.policyName = policy.name;
      this.applyPolicy(policy);
      await this.connectToPolicyTopic(policyId);
      this.infoMessage = `Editando politica: ${policy.name}`;
      this.cdr.detectChanges();
    } catch (error) {
      this.infoMessage = `Error cargando politica: ${error}`;
      this.cdr.detectChanges();
    }
  }

  private scheduleCellRealtimeSync(cell: dia.Cell, delayMs = 140): void {
    if (this.isRemoteChange || !this.selectedPolicyId) {
      return;
    }

    const cellId = String(cell.id);
    const pendingTimeout = this.cellSyncTimeouts.get(cellId);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
    }

    const timeoutId = setTimeout(() => {
      this.cellSyncTimeouts.delete(cellId);
      this.sendCellSnapshot(cell);
    }, delayMs);

    this.cellSyncTimeouts.set(cellId, timeoutId);
  }

  private sendCellSnapshot(cell: dia.Cell): void {
    if (!this.selectedPolicyId || this.isRemoteChange) {
      return;
    }

    const event: DiagramEvent = {
      action: 'update',
      cellId: String(cell.id),
      payload: {
        cell: cell.toJSON(),
        clientId: this.clientId
      }
    };

    this.webSocketService.sendMessage(this.selectedPolicyId, event);
  }

  private async connectToPolicyTopic(policyId: string): Promise<void> {
    try {
      await this.webSocketService.connect();
      this.policySubscription?.unsubscribe();
      this.policySubscription = this.webSocketService.subscribeToPolicy(policyId, (event) => {
        this.handleRemoteEvent(event);
      });
    } catch (error) {
      this.infoMessage = `Conexion en tiempo real no disponible: ${error}`;
    }
  }

  private handleRemoteEvent(event: DiagramEvent): void {
    if (event.payload?.['clientId'] === this.clientId) {
      return;
    }

    switch (event.action) {
      case 'move':
        this.applyRemoteMove(event);
        return;
      case 'add':
        this.applyRemoteAdd(event);
        return;
      case 'remove':
        this.applyRemoteRemove(event);
        return;
      case 'update':
        this.applyRemoteCellSnapshot(event);
        return;
      default:
        return;
    }
  }

  private applyRemoteMove(event: DiagramEvent): void {
    const cell = this.graph.getCell(event.cellId);
    if (!cell || !cell.isElement()) {
      return;
    }

    const x = Number(event.payload?.['x']);
    const y = Number(event.payload?.['y']);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    const element = cell as dia.Element;
    const current = element.position();
    if (current.x === x && current.y === y) {
      return;
    }

    this.isRemoteChange = true;
    try {
      element.position(x, y);
    } finally {
      this.isRemoteChange = false;
    }
  }

  private applyRemoteAdd(event: DiagramEvent): void {
    const payloadCell = event.payload?.['cell'];
    if (!payloadCell || typeof payloadCell !== 'object') {
      return;
    }

    if (this.graph.getCell(event.cellId)) {
      return;
    }

    this.isRemoteChange = true;
    try {
      this.graph.addCell(payloadCell as dia.Cell.JSON);
    } finally {
      this.isRemoteChange = false;
    }
  }

  private applyRemoteRemove(event: DiagramEvent): void {
    const cell = this.graph.getCell(event.cellId);
    if (!cell) {
      return;
    }

    this.isRemoteChange = true;
    try {
      cell.remove();
    } finally {
      this.isRemoteChange = false;
    }
  }

  private applyRemoteCellSnapshot(event: DiagramEvent): void {
    const cell = this.graph.getCell(event.cellId);
    const cellSnapshot = event.payload?.['cell'];

    if (!cell || !cellSnapshot || typeof cellSnapshot !== 'object') {
      return;
    }

    this.isRemoteChange = true;
    try {
      const snapshot = cellSnapshot as Record<string, unknown>;
      const partialUpdate: Record<string, unknown> = {};

      if ('attrs' in snapshot) partialUpdate['attrs'] = snapshot['attrs'];
      if ('nodeMeta' in snapshot) partialUpdate['nodeMeta'] = snapshot['nodeMeta'];
      if ('conditionLabel' in snapshot) partialUpdate['conditionLabel'] = snapshot['conditionLabel'];
      if ('labels' in snapshot) partialUpdate['labels'] = snapshot['labels'];
      if ('vertices' in snapshot) partialUpdate['vertices'] = snapshot['vertices'];
      if ('size' in snapshot) partialUpdate['size'] = snapshot['size'];

      if (Object.keys(partialUpdate).length > 0) {
        cell.set(partialUpdate);
      }

      if (cell.isElement() && snapshot['position'] && typeof snapshot['position'] === 'object') {
        const position = snapshot['position'] as Record<string, unknown>;
        const x = Number(position['x']);
        const y = Number(position['y']);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          (cell as dia.Element).position(x, y);
        }
      }
    } finally {
      this.isRemoteChange = false;
    }
  }

  private async loadCompanyAreas(): Promise<void> {
    try {
      this.availableAreas = await this.companyAreaService.getCompanyAreas();
    } catch (error) {
      this.availableAreas = [];
      this.infoMessage = error instanceof Error ? error.message : 'No se pudieron cargar las areas de la empresa.';
    }
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
    this.suppressAutoSave = true;
    try {
      this.selectedSourceId = null;
      this.selectedTargetId = null;
      this.isConnectionMode = false;
      const normalizedLanes = this.normalizeLanesFromAreas(policy.lanes ?? []);
      this.lanes = this.diagramCanvasService.recalculateLanePositions(normalizedLanes);
      this.diagramCanvasService.renderPolicy(this.graph, policy, this.lanes);
      this.diagramStorageService.clear();
    } finally {
      this.suppressAutoSave = false;
    }
  }

  private normalizeLanesFromAreas(sourceLanes: Lane[]): Lane[] {
    if (this.availableAreas.length === 0) {
      return sourceLanes;
    }

    return sourceLanes
      .map((lane) => {
        const matchedArea = this.availableAreas.find(
          (area) => area.id === lane.id || area.name === lane.id || area.name === lane.name
        );
        if (!matchedArea) {
          return null;
        }
        return {
          id: matchedArea.name,
          name: matchedArea.name,
          color: matchedArea.color,
          x: lane.x ?? 0
        } as Lane;
      })
      .filter((lane): lane is Lane => lane !== null);
  }

  private scheduleLocalSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.diagramStorageService.save(this.selectedPolicyId, this.graph, this.lanes);
    }, 500);
  }

  private scheduleAutoSave(): void {
    if (!this.selectedPolicyId) {
      return;
    }

    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    this.autoSaveTimeout = setTimeout(() => {
      void this.persistPolicyGraph();
    }, 1200);
  }

  private async persistPolicyGraph(): Promise<void> {
    if (!this.selectedPolicyId) {
      return;
    }

    if (this.autoSaveInFlight) {
      this.pendingAutoSave = true;
      return;
    }

    this.autoSaveInFlight = true;
    try {
      const graphJson = JSON.stringify(this.diagramCanvasService.getPersistedGraphJSON(this.graph));
      await this.policyDataService.updatePolicyDiagram(this.selectedPolicyId, graphJson, this.lanes);
      this.infoMessage = 'Cambios guardados automaticamente.';
    } catch (error) {
      this.infoMessage = `Error en guardado automatico: ${error}`;
    } finally {
      this.autoSaveInFlight = false;
      if (this.pendingAutoSave) {
        this.pendingAutoSave = false;
        void this.persistPolicyGraph();
      }
    }
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





