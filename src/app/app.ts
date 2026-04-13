import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { dia, shapes } from '@joint/plus';
import { executeGraphql } from './graphql.service';

interface PolicySummary {
  id: string;
  name: string;
  description?: string;
}

interface Lane {
  id: string;
  name: string;
  color: string;
  x: number;
}

interface PolicyPayload extends PolicySummary {
  diagramJson?: string;
  lanes?: Lane[];
}

interface DiagramState {
  policyId: string | null;
  diagramJson: string;
  lanes: Lane[];
}

const COLORS = ['#d1fae5', '#dbeafe', '#fef3c7', '#fecaca', '#f3e8ff', '#e0e7ff'];

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, NgFor, NgIf],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App implements OnInit, AfterViewInit {
  @ViewChild('canvas')
  canvas!: ElementRef;

  private graph!: dia.Graph;
  private paper!: dia.Paper;
  private saveTimeout: any;
  private laneBackgrounds: dia.Element[] = [];
  private draggingNodeType: string | null = null;
  private draggedNodeData: { x: number; y: number } | null = null;

  public policies: PolicySummary[] = [];
  public selectedPolicyId: string | null = null;
  public newPolicyName = '';
  public newPolicyDescription = '';
  public infoMessage = 'Cargando políticas...';
  
  // 🚩 CORRECCIÓN 1: Usar dia.Cell.ID en lugar de string forzado
  public selectedSourceId: dia.Cell.ID | null = null;
  public selectedTargetId: dia.Cell.ID | null = null;
  
  public isConnectionMode = false;
  public lanes: Lane[] = [];
  public newLaneName = '';
  public isCanvasDragOver = false;
  private nextLaneX = 150;

  public ngOnInit(): void {
    this.graph = new dia.Graph({}, { cellNamespace: shapes });

    this.paper = new dia.Paper({
      model: this.graph,
      background: {
        color: '#F8F9FA'
      },
      async: true,
      sorting: dia.Paper.sorting.APPROX,
      cellViewNamespace: shapes,
      width: 1200,
      height: 800,
      gridSize: 10,
      drawGrid: true,
      // 🚩 SUGERENCIA: Dejé elementMove en true para que puedas acomodar los nodos
      interactive: () => ({
        elementMove: true, 
        addLinkFromMagnet: false,
        labelMove: false,
        linkMove: false
      }),
      clickThreshold: 5,
      moving: { validating: false }
    });

    // 🚩 LÓGICA DE CLIC CORREGIDA
    this.paper.on('element:pointerclick', (cellView: any) => {
      if ((cellView.model as any).isLaneBackground) {
        return;
      }

      const element = cellView.model as dia.Element;
      const clickedId = element.id; // ¡Sin .toString()!

      if (!this.isConnectionMode) {
        this.selectedSourceId = clickedId;
        this.selectedTargetId = null;
        this.infoMessage = `Nodo seleccionado.`;
        return;
      }

      // Si no hay origen, este clic será el origen
      if (!this.selectedSourceId) {
        this.selectedSourceId = clickedId;
        this.selectedTargetId = null;
        this.infoMessage = `Origen seleccionado. Ahora haz clic en el nodo destino.`;
        return;
      }

      // Evitar conexiones consigo mismo
      if (this.selectedSourceId === clickedId) {
        this.infoMessage = 'Selecciona un nodo distinto como destino.';
        return;
      }

      // Si ya hay origen y no es el mismo, este es el destino
      this.selectedTargetId = clickedId;
      this.createConnectionFromSelection();
    });

    this.paper.on('element:pointerdown', (cellView: any) => {
      if ((cellView.model as any).isLaneBackground) {
        cellView.model.toFront();
      }
    });

    this.paper.on('blank:pointerdown', () => {
      this.clearSelection();
    });

    this.graph.on('add remove change', () => {
      this.saveToLocalStorage();
    });

    void this.initializeApp();
  }

  public ngAfterViewInit(): void {
    this.canvas.nativeElement.appendChild(this.paper.el);
    this.paper.unfreeze();
  }

  private async initializeApp(): Promise<void> {
    await this.loadPolicyList();
    this.restoreFromLocalStorage();
  }

  public async loadPolicyList(): Promise<void> {
    try {
      const response = await executeGraphql<{ getAllPolicies: PolicySummary[] }>(`
        query GetAllPolicies {
          getAllPolicies {
            id
            name
            description
          }
        }
      `);
      this.policies = response.getAllPolicies ?? [];
      this.infoMessage = 'Lista de políticas cargada.';
    } catch (error) {
      this.infoMessage = `Error cargando políticas: ${error}`;
    }
  }

  public async onPolicySelect(event: Event): Promise<void> {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedPolicyId = value || null;
    if (this.selectedPolicyId) {
      this.infoMessage = `Política seleccionada: ${this.selectedPolicyId}`;
    }
  }

  public async loadPolicy(): Promise<void> {
    if (!this.selectedPolicyId) {
      this.infoMessage = 'Selecciona una política antes de cargar.';
      return;
    }

    try {
      const response = await executeGraphql<{ getPolicyById: PolicyPayload }>(`
        query GetPolicyById($id: ID!) {
          getPolicyById(id: $id) {
            id
            name
            description
            diagramJson
            lanes {
              id
              name
              color
              x
            }
          }
        }
      `, { id: this.selectedPolicyId });

      if (response.getPolicyById) {
        this.renderPolicy(response.getPolicyById);
        this.infoMessage = `Diagrama de política ${response.getPolicyById.name} cargado ✓`;
      } else {
        this.infoMessage = 'Política no encontrada.';
      }
    } catch (error) {
      this.infoMessage = `Error al cargar política: ${error}`;
    }
  }

  public async createPolicy(): Promise<void> {
    if (!this.newPolicyName.trim()) {
      this.infoMessage = 'Debes ingresar un nombre para la política.';
      return;
    }

    try {
      const response = await executeGraphql<{ createPolicy: PolicySummary }>(`
        mutation CreatePolicy($name: String!, $description: String) {
          createPolicy(name: $name, description: $description) {
            id
            name
            description
          }
        }
      `, {
        name: this.newPolicyName,
        description: this.newPolicyDescription
      });

      this.selectedPolicyId = response.createPolicy.id;
      this.newPolicyName = '';
      this.newPolicyDescription = '';
      this.graph.clear();
      this.lanes = [];
      this.nextLaneX = 150;

      await this.loadPolicyList();
      this.infoMessage = `Política creada: ${response.createPolicy.name}`;
    } catch (error) {
      this.infoMessage = `Error creando política: ${error}`;
    }
  }

  public async savePolicyGraph(): Promise<void> {
    if (!this.selectedPolicyId) {
      this.infoMessage = 'Selecciona una política antes de guardar.';
      return;
    }

    try {
      const graphJson = JSON.stringify(this.getPersistedGraphJSON());

      await executeGraphql<{ updatePolicyGraph: PolicySummary }>(`
        mutation UpdatePolicyGraph($policyId: ID!, $diagramJson: String!) {
          updatePolicyGraph(policyId: $policyId, diagramJson: $diagramJson) {
            id
            name
          }
        }
      `, {
        policyId: this.selectedPolicyId,
        diagramJson: graphJson
      });

      this.infoMessage = 'Diagrama guardado correctamente en MongoDB ✓';
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
      name: this.newLaneName,
      color: COLORS[this.lanes.length % COLORS.length],
      x: this.nextLaneX
    };

    this.lanes.push(lane);
    this.recalculateLanePositions();
    this.newLaneName = '';
    this.renderLaneBackgrounds();
    this.infoMessage = `Calle "${lane.name}" agregada.`;
    this.saveToLocalStorage();
  }

  public removeLane(laneId: string): void {
    const laneIndex = this.lanes.findIndex((l) => l.id === laneId);
    if (laneIndex >= 0) {
      this.lanes.splice(laneIndex, 1);
      this.recalculateLanePositions();
      this.renderLaneBackgrounds();
      this.infoMessage = 'Calle eliminada.';
      this.saveToLocalStorage();
    }
  }

  private renderLaneBackgrounds(): void {
    this.laneBackgrounds.forEach((bg) => bg.remove());
    this.laneBackgrounds = [];

    if (this.lanes.length === 0) return;

    const laneWidth = this.getLaneWidth();
    const canvasHeight = 800;
    const headerHeight = 44;

    this.lanes.forEach((lane, index) => {
      const bg = new shapes.standard.Rectangle({
        z: -1,
        position: { x: index * laneWidth, y: 0 },
        size: { width: laneWidth, height: canvasHeight },
        isLaneBackground: true,
        attrs: {
          body: {
            fill: lane.color,
            opacity: 0.22,
            stroke: lane.color,
            strokeWidth: 2,
            strokeDasharray: '5,5'
          },
          label: {
            text: '',
            fill: '#475569'
          }
        }
      });

      const header = new shapes.standard.Rectangle({
        z: -1,
        position: { x: index * laneWidth, y: 0 },
        size: { width: laneWidth, height: headerHeight },
        isLaneBackground: true,
        attrs: {
          body: {
            fill: lane.color,
            opacity: 0.58,
            stroke: lane.color,
            strokeWidth: 1
          },
          label: {
            text: lane.name,
            fill: '#1e293b',
            fontSize: 13,
            fontWeight: '700',
            refX: '50%',
            refY: '50%',
            textAnchor: 'middle',
            textVerticalAnchor: 'middle'
          }
        }
      });

      (bg as any).laneId = lane.id;
      (header as any).laneId = lane.id;
      this.graph.addCell(bg);
      this.graph.addCell(header);
      this.laneBackgrounds.push(bg);
      this.laneBackgrounds.push(header);
    });
  }

  public addNode(type: string, label: string, x?: number, y?: number): void {
    const nodeSize = this.getNodeSize(type);
    const posX = this.clampNodeX(x ?? 80, nodeSize.width);
    const posY = this.clampNodeY(y ?? 80, nodeSize.height);

    const shape = this.createShape(type, label, posX, posY);
    (shape as any).nodeType = type;
    (shape as any).laneId = this.getLaneIdByX(posX + nodeSize.width / 2) ?? 'default';
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
    const nodeSize = this.getNodeSize(nodeType);
    this.draggedNodeData = {
      x: nodeSize.width / 2,
      y: nodeSize.height / 2
    };

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
      dragElement.style.left = moveEvent.clientX - nodeSize.width / 2 + 'px';
      dragElement.style.top = moveEvent.clientY - nodeSize.height / 2 + 'px';
    };

    const upHandler = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
      dragElement.remove();

      const paperRect = this.paper.viewport.getBoundingClientRect();

      if (
        upEvent.clientX >= paperRect.left &&
        upEvent.clientX <= paperRect.right &&
        upEvent.clientY >= paperRect.top &&
        upEvent.clientY <= paperRect.bottom
      ) {
        const offsetX = upEvent.clientX - paperRect.left;
        const offsetY = upEvent.clientY - paperRect.top;

        this.addNode(this.draggingNodeType!, label, offsetX, offsetY);
      }

      this.draggingNodeType = null;
      this.draggedNodeData = null;
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  private getNodeSize(type: string): { width: number; height: number } {
    switch (type) {
      case 'START':
      case 'END':
        return { width: 80, height: 80 };
      case 'DECISION':
        return { width: 120, height: 120 };
      case 'TASK':
      default:
        return { width: 140, height: 70 };
    }
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
    const nodeSize = this.getNodeSize(nodeType);
    const x = event.clientX - canvasRect.left - nodeSize.width / 2;
    const y = event.clientY - canvasRect.top - nodeSize.height / 2;

    this.addNode(nodeType, label, x, y);
  }

  public connectSelected(): void {
    this.isConnectionMode = !this.isConnectionMode;
    if (!this.isConnectionMode) {
      this.clearSelection();
      this.infoMessage = 'Modo conexión desactivado.';
      return;
    }

    this.selectedSourceId = null;
    this.selectedTargetId = null;
    this.infoMessage = 'Modo conexión activado. Selecciona el nodo origen y luego el nodo destino.';
  }

  private createConnectionFromSelection(): void {
    if (!this.selectedSourceId || !this.selectedTargetId) {
      return;
    }

    const source = this.graph.getCell(this.selectedSourceId) as dia.Element;
    const target = this.graph.getCell(this.selectedTargetId) as dia.Element;

    if (!source || !target) {
      this.infoMessage = 'No se encontró uno de los nodos en el modelo.';
      return;
    }

    if (this.hasExistingLink(source.id, target.id)) {
      this.selectedSourceId = null;
      this.selectedTargetId = null;
      this.infoMessage = 'Ese enlace ya existe. Selecciona un nuevo origen.';
      return;
    }

    const link = this.createLink(source, target);
    this.graph.addCell(link);
    
    // Reiniciar para poder crear la siguiente flecha enseguida
    this.selectedSourceId = null;
    this.selectedTargetId = null;
    this.infoMessage = `Flecha creada con éxito. Puedes seleccionar otro origen.`;
  }

  public clearSelection(): void {
    this.selectedSourceId = null;
    this.selectedTargetId = null;
    this.infoMessage = 'Selección reseteada.';
  }

  public newDiagram(): void {
    this.graph.clear();
    this.laneBackgrounds = [];
    this.lanes = [];
    this.selectedPolicyId = null;
    this.selectedSourceId = null;
    this.selectedTargetId = null;
    this.isConnectionMode = false;
    this.nextLaneX = 150;
    localStorage.removeItem('diagramState');
    this.infoMessage = 'Nuevo diagrama creado.';
  }

  private renderPolicy(policy: PolicyPayload): void {
    this.graph.clear();
    this.laneBackgrounds = [];
    this.selectedSourceId = null;
    this.selectedTargetId = null;
    this.isConnectionMode = false;

    if (policy.diagramJson) {
      try {
        const graphData = this.sanitizeGraphJSON(JSON.parse(policy.diagramJson));
        this.graph.fromJSON(graphData);
      } catch (error) {
        console.error('Error restaurando diagrama:', error);
        this.infoMessage = 'Error al restaurar el diagrama';
        return;
      }
    }

    if (policy.lanes && policy.lanes.length > 0) {
      this.lanes = policy.lanes;
      this.recalculateLanePositions();
      this.renderLaneBackgrounds();
    }

    localStorage.removeItem('diagramState');
  }

  private createShape(type: string, label: string, x: number, y: number): dia.Element {
    const baseOptions = {
      position: { x, y },
      z: 10,
      attrs: {
        body: {
          fill: '#ffffff',
          stroke: '#3b82f6',
          strokeWidth: 2
        },
        label: {
          text: label,
          fill: '#1f2937',
          fontSize: 14,
          fontWeight: '600',
          textWrap: { width: -10, height: -10 }
        }
      }
    };

    switch (type) {
      case 'START':
        return new shapes.standard.Circle({
          ...baseOptions,
          size: { width: 80, height: 80 },
          attrs: {
            ...baseOptions.attrs,
            body: { ...baseOptions.attrs.body, fill: '#d1fae5', stroke: '#10b981' }
          }
        });
      case 'DECISION':
        return new shapes.standard.Polygon({
          ...baseOptions,
          size: { width: 120, height: 120 },
          attrs: {
            body: {
              refPoints: '0,60 60,0 120,60 60,120',
              fill: '#fbbf24',
              stroke: '#b45309',
              strokeWidth: 2
            },
            label: { ...baseOptions.attrs.label, text: label }
          }
        });
      case 'END':
        return new shapes.standard.Circle({
          ...baseOptions,
          size: { width: 90, height: 90 },
          attrs: {
            ...baseOptions.attrs,
            body: { ...baseOptions.attrs.body, fill: '#fee2e2', stroke: '#ef4444', strokeWidth: 4 }
          }
        });
      default:
        return new shapes.standard.Rectangle({
          ...baseOptions,
          size: { width: 140, height: 70 },
          attrs: {
            ...baseOptions.attrs,
            body: { ...baseOptions.attrs.body, rx: 8, ry: 8, fill: '#eff6ff' }
          }
        });
    }
  }

  // 🚩 CORRECCIÓN 2 y 3: Crear el link usando la sintaxis nativa y segura de JointJS
  private createLink(source: dia.Element, target: dia.Element, condition?: string): dia.Link {
    const link = new shapes.standard.Link();

    // Enlazamos usando los métodos nativos (mucho más seguro)
    link.source(source);
    link.target(target);
    link.set('z', 1000); // Forzamos un Z index alto para que se vea sobre todo

    // Configuramos los atributos visuales (color, grosor y punta de la flecha)
    link.attr({
      line: {
        stroke: '#0f172a',
        strokeWidth: 3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        targetMarker: {
          'type': 'path',
          'd': 'M 10 -5 0 0 10 5 z',
          'fill': '#0f172a',
          'stroke': '#0f172a',
          'stroke-width': 1
        }
      }
    });

    if (condition) {
      link.appendLabel({
        attrs: {
          text: {
            text: condition,
            fill: '#0f172a',
            fontSize: 13,
            fontWeight: 'bold'
          },
          rect: {
            fill: '#ffffff',
            stroke: '#0f172a',
            strokeWidth: 1,
            rx: 3,
            ry: 3
          }
        },
        position: 0.5
      });
    }

    link.router('orthogonal', { padding: 30 });
    link.connector('straight', { cornerType: 'line' });
    return link;
  }

  private hasExistingLink(sourceId: dia.Cell.ID, targetId: dia.Cell.ID): boolean {
    return this.graph.getLinks().some((link) => {
      const currentSourceId = link.get('source')?.id;
      const currentTargetId = link.get('target')?.id;
      return currentSourceId === sourceId && currentTargetId === targetId;
    });
  }

  private saveToLocalStorage(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      const state: DiagramState = {
        policyId: this.selectedPolicyId,
        diagramJson: JSON.stringify(this.getPersistedGraphJSON()),
        lanes: this.lanes
      };
      localStorage.setItem('diagramState', JSON.stringify(state));
    }, 500);
  }

  private restoreFromLocalStorage(): void {
    const saved = localStorage.getItem('diagramState');
    if (!saved) return;

    try {
      const state: DiagramState = JSON.parse(saved);
      this.selectedPolicyId = state.policyId;
      this.isConnectionMode = false;
      this.lanes = state.lanes ?? [];
      this.recalculateLanePositions();

      this.graph.clear();
      this.laneBackgrounds = [];
      this.renderLaneBackgrounds();

      if (state.diagramJson) {
        const graphData = this.sanitizeGraphJSON(JSON.parse(state.diagramJson));
        this.graph.fromJSON(graphData);
      }

      this.infoMessage = 'Diagrama restaurado desde localStorage ✓';
    } catch (error) {
      console.error('Error restaurando diagrama:', error);
      localStorage.removeItem('diagramState');
    }
  }

  private getPersistedGraphJSON(): dia.Graph.JSON {
    const graphJson = this.graph.toJSON() as dia.Graph.JSON;
    return {
      ...graphJson,
      cells: graphJson.cells.filter((cell: any) => !cell.isLaneBackground)
    };
  }

  private sanitizeGraphJSON(graphJson: dia.Graph.JSON): dia.Graph.JSON {
    return {
      ...graphJson,
      cells: graphJson.cells.filter((cell: any) => !cell.isLaneBackground)
    };
  }

  private getLaneWidth(): number {
    const paperWidth = typeof this.paper.options.width === 'number' ? this.paper.options.width : 1200;
    return this.lanes.length > 0 ? paperWidth / this.lanes.length : paperWidth;
  }

  private recalculateLanePositions(): void {
    const laneWidth = this.getLaneWidth();
    this.lanes = this.lanes.map((lane, index) => ({
      ...lane,
      x: index * laneWidth + laneWidth / 2
    }));
    this.nextLaneX = this.lanes.length * laneWidth + laneWidth / 2;
  }

  private getLaneIdByX(x: number): string | null {
    if (this.lanes.length === 0) return null;
    const laneWidth = this.getLaneWidth();
    const index = Math.max(0, Math.min(this.lanes.length - 1, Math.floor(x / laneWidth)));
    return this.lanes[index]?.id ?? null;
  }

  private clampNodeX(x: number, nodeWidth: number): number {
    const paperWidth = typeof this.paper.options.width === 'number' ? this.paper.options.width : 1200;
    return Math.max(10, Math.min(x, paperWidth - nodeWidth - 10));
  }

  private clampNodeY(y: number, nodeHeight: number): number {
    const paperHeight = typeof this.paper.options.height === 'number' ? this.paper.options.height : 800;
    return Math.max(54, Math.min(y, paperHeight - nodeHeight - 10));
  }
}