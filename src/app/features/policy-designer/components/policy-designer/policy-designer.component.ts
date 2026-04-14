import { CommonModule, NgFor, NgIf } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
// 🚩 IMPORTANTE: Importamos linkTools, elementTools y ui
import { dia, shapes, linkTools, elementTools, ui } from '@joint/plus'; 
import { DiagramCanvasService } from '../../services/diagram-canvas.service';
import { DiagramStorageService } from '../../services/diagram-storage.service';
import { PolicyDataService } from '../../services/policy-data.service';
import { Lane, PolicyPayload, PolicySummary } from '../../models/policy-designer.models';
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
  public newElementName = '';
  public isRenaming = false;

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

    const toolsView = new dia.ToolsView({
      tools: [
        new linkTools.Vertices(),
        new linkTools.Segments(),
        new linkTools.SourceArrowhead(),
        new linkTools.TargetArrowhead(),
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
      // 🚩 IMPORTANTE: Quitamos el `toFront()` para las calles
      // Si la calle se va al frente, ¡tapa a todos los nodos!
      if (!(cellView.model as any).isLaneBackground) {
        cellView.model.toFront(); // Solo los nodos se van al frente al agarrarlos
      }
    });

    this.paper.on('blank:pointerdown', () => {
      this.clearTools(); 
      this.selectedElementId = null;
      this.selectedElementType = null;
      this.isRenaming = false;
      this.clearSelection();
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
    this.infoMessage = `Nodo "${label}" agregado al lienzo.`;
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
      this.infoMessage = `Nodo seleccionado: "${this.newElementName}"`;
    } else if (element && element.isLink()) {
      this.infoMessage = 'Flecha seleccionada.';
    }
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

    const link = this.diagramCanvasService.createLink(source, target);
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
}