/**
 * Sketch Collaboration — REMOVED.
 * Real-time collaboration has been removed.
 * This file exports type stubs only.
 */

export type CollabRole = 'editor' | 'viewer';

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number; tool?: string };
  lastSeen: number;
  isDrawing?: boolean;
  role?: CollabRole;
}

export interface CollabChatMessage {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  text: string;
  timestamp: number;
}

export interface CollabSession {
  roomId: string;
  userName: string;
  userColor: string;
  role: CollabRole;
  timestamp: number;
}

export type LayerAction = 'add' | 'delete' | 'rename' | 'reorder' | 'visibility' | 'opacity' | 'blendMode';

export interface RemoteStroke { id: string; stroke: any; layerId: number; userId: string; userName: string; userColor: string; timestamp: number; }
export interface LiveStroke { userId: string; userName: string; userColor: string; stroke: any; layerId: number; timestamp: number; }
export interface RemoteTextAnnotation { id: string; annotation: any; layerId: number; userId: string; userName: string; timestamp: number; action: string; }
export interface RemoteWashiTape { id: string; tape: any; layerId: number; userId: string; userName: string; timestamp: number; action: string; }
export interface RemoteStickyNote { id: string; stickyNote: any; layerId: number; userId: string; userName: string; timestamp: number; action: string; }
export interface RemoteImageElement { id: string; image: any; layerId: number; userId: string; userName: string; timestamp: number; action: string; }
export interface RemoteTransform { userId: string; userName: string; layerId: number; strokeIndices: number[]; collabStrokeIds: string[]; transformedStrokes: any[]; timestamp: number; }
export interface RemoteClear { userId: string; userName: string; layerId: number | 'all'; timestamp: number; }
export interface SharedViewport { zoom: number; panX: number; panY: number; userId: string; timestamp: number; }
export interface RemotePageSwitch { userId: string; userName: string; pageIndex: number; timestamp: number; }
export interface RemoteLayerEvent { userId: string; userName: string; action: LayerAction; timestamp: number; }

// No-op stubs
export const getCollabColor = (i: number) => ['#ef4444','#3b82f6','#22c55e'][i % 3];
export const createCollabRoom = async (): Promise<string> => { throw new Error('Collaboration removed'); };
export const doesRoomExist = async (): Promise<boolean> => false;
export const joinRoom = async (): Promise<string> => { throw new Error('Collaboration removed'); };
export const leaveRoom = async (): Promise<void> => {};
export const saveCollabSession = (): void => {};
export const loadCollabSession = (): CollabSession | null => null;
export const clearCollabSession = (): void => {};
export const generateShareLink = (): string => '';
export const broadcastCursor = (): void => {};
export const broadcastLiveStroke = (): void => {};
export const clearLiveStroke = (): void => {};
export const broadcastStroke = async (): Promise<string> => '';
export const removeRemoteStroke = async (): Promise<void> => {};
export const broadcastStrokesDeletion = async (): Promise<void> => {};
export const broadcastTextAnnotation = async (): Promise<void> => {};
export const broadcastWashiTape = async (): Promise<void> => {};
export const broadcastStickyNote = async (): Promise<void> => {};
export const broadcastImageElement = async (): Promise<void> => {};
export const broadcastTransform = (): void => {};
export const clearTransform = (): void => {};
export const broadcastClearLayer = (): void => {};
export const broadcastViewport = (): void => {};
export const broadcastPageSwitch = (): void => {};
export const broadcastLayerEvent = (): void => {};
export const broadcastChatMessage = (): void => {};
export const broadcastFollowRequest = (): void => {};
export const clearFollowRequest = (): void => {};
export const setUserRole = async (): Promise<void> => {};
export const getRoomCreator = async (): Promise<string> => '';
export const listenToUsers = (): (() => void) => () => {};
export const listenToStrokes = (): (() => void) => () => {};
export const listenToLiveStrokes = (): (() => void) => () => {};
export const listenToTextAnnotations = (): (() => void) => () => {};
export const listenToWashiTapes = (): (() => void) => () => {};
export const listenToStickyNotes = (): (() => void) => () => {};
export const listenToImageElements = (): (() => void) => () => {};
export const listenToTransforms = (): (() => void) => () => {};
export const listenToClearEvents = (): (() => void) => () => {};
export const listenToViewports = (): (() => void) => () => {};
export const listenToPageSwitches = (): (() => void) => () => {};
export const listenToLayerEvents = (): (() => void) => () => {};
export const listenToChat = (): (() => void) => () => {};
