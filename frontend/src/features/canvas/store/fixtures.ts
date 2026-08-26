import type { Edge, XYPosition } from '@xyflow/react'

import type { CanvasImage, CanvasNode, ProjectCanvasState } from '../../../types/domain'


const demoImages = {
  overview: new URL('../../../assets/demo/city-overview.webp', import.meta.url).href,
  street: new URL('../../../assets/demo/street-level.webp', import.meta.url).href,
  transit: new URL('../../../assets/demo/transit-hub.webp', import.meta.url).href,
}

function createImage(
  id: string,
  imageUrl: string,
  fileName: string,
  name: string,
  prompt: string,
  parentId: string | null,
  createdTime: string,
): CanvasImage {
  return {
    id,
    projectId: 'future-city',
    imageUrl,
    imageSource: 'fixture',
    fileName,
    name,
    prompt,
    tags: ['未来城市', '建筑概念'],
    sourceIds: parentId ? [parentId] : [],
    parentId,
    createdTime,
  }
}

function createNode(image: CanvasImage, position: XYPosition): CanvasNode {
  return {
    id: image.id,
    type: 'image',
    position,
    data: { image },
  }
}

export function createInitialCanvases(): Record<string, ProjectCanvasState> {
  const nodes: CanvasNode[] = [
    createNode(
      createImage(
        'city-overview',
        demoImages.overview,
        'city-overview.webp',
        '滨海未来城市',
        'Near-future coastal city, layered civic terraces, diffuse overcast daylight, restrained teal transit details',
        null,
        '2026-08-21T09:30:00+08:00',
      ),
      { x: 40, y: 40 },
    ),
    createNode(
      createImage(
        'street-level',
        demoImages.street,
        'street-level.webp',
        '滨海步行街',
        'Pedestrian street within the coastal city, graphite concrete arcades, calm public space, human scale',
        'city-overview',
        '2026-08-21T10:05:00+08:00',
      ),
      { x: 340, y: 190 },
    ),
    createNode(
      createImage(
        'transit-hub',
        demoImages.transit,
        'transit-hub.webp',
        '城市交通枢纽',
        'Compact urban transit interchange, sheltered platforms, clear pedestrian flow, teal mobility accents',
        'street-level',
        '2026-08-21T10:42:00+08:00',
      ),
      { x: 640, y: 350 },
    ),
  ]

  const edges: Edge[] = [
    { id: 'edge-city-overview-street-level', source: 'city-overview', target: 'street-level', type: 'smoothstep', interactionWidth: 24 },
    { id: 'edge-street-level-transit-hub', source: 'street-level', target: 'transit-hub', type: 'smoothstep', interactionWidth: 24 },
  ]

  return {
    'future-city': { nodes, edges, selectedNodeId: null },
    'product-concepts': { nodes: [], edges: [], selectedNodeId: null },
    architecture: { nodes: [], edges: [], selectedNodeId: null },
  }
}
