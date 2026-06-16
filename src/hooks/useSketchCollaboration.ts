/**
 * Sketch collaboration hook — REMOVED.
 * Real-time collaboration has been removed from the app.
 * This hook is a no-op stub that returns disconnected state.
 */

import type { CollabRole, CollabUser, CollabChatMessage, RemoteStroke, LiveStroke, RemoteTextAnnotation, RemoteWashiTape, RemoteStickyNote, RemoteImageElement, RemoteTransform, SharedViewport, RemotePageSwitch, RemoteLayerEvent, LayerAction } from '@/utils/sketchCollaboration';
import type { Stroke, TextAnnotation, WashiTapeData, StickyNoteData, CanvasImageData } from '@/components/sketch/SketchTypes';

export interface UseSketchCollaborationReturn {
  isConnected: boolean;
  roomId: string | null;
  users: CollabUser[];
  remoteStrokes: RemoteStroke[];
  remoteLiveStrokes: LiveStroke[];
  remoteTextAnnotations: RemoteTextAnnotation[];
  remoteWashiTapes: RemoteWashiTape[];
  remoteStickyNotes: RemoteStickyNote[];
  remoteImageElements: RemoteImageElement[];
  remoteTransforms: RemoteTransform[];
  remoteViewports: SharedViewport[];
  remotePageSwitches: RemotePageSwitch[];
  followingUserId: string | null;
  myColor: string;
  myName: string;
  myUserId: string | null;
  myRole: CollabRole;
  isRoomCreator: boolean;
  chatMessages: CollabChatMessage[];
  unreadCount: number;
  createRoom: (name?: string) => Promise<string>;
  joinExistingRoom: (roomId: string, role?: CollabRole) => Promise<void>;
  leave: () => Promise<void>;
  sendCursor: (x: number, y: number, tool?: string, isDrawing?: boolean) => void;
  sendLiveStroke: (stroke: Stroke, layerId: number) => void;
  finishLiveStroke: () => void;
  sendStroke: (stroke: Stroke, layerId: number) => Promise<string | null>;
  undoMyLastStroke: () => Promise<void>;
  deleteRemoteStrokes: (strokeIds: string[]) => Promise<void>;
  getShareLink: () => string | null;
  sendTextAnnotation: (annotation: TextAnnotation, layerId: number, action: 'add' | 'update' | 'delete') => void;
  sendWashiTape: (tape: WashiTapeData, layerId: number, action: 'add' | 'update' | 'delete') => void;
  sendStickyNote: (note: StickyNoteData, layerId: number, action: 'add' | 'update' | 'delete') => void;
  sendImageElement: (image: CanvasImageData, layerId: number, action: 'add' | 'update' | 'delete') => void;
  sendTransform: (layerId: number, collabStrokeIds: string[], transformedStrokes: Stroke[]) => void;
  finishTransform: () => void;
  sendClearLayer: (layerId: number | 'all') => void;
  sendViewport: (zoom: number, panX: number, panY: number) => void;
  sendPageSwitch: (pageIndex: number) => void;
  sendLayerEvent: (action: LayerAction, data?: Partial<RemoteLayerEvent>) => void;
  sendChatMessage: (text: string) => void;
  markChatRead: () => void;
  followUser: (userId: string | null) => void;
  changeUserRole: (targetUserId: string, role: CollabRole) => Promise<void>;
}

const noop = () => {};
const noopAsync = async () => {};

export const useSketchCollaboration = (): UseSketchCollaborationReturn => ({
  isConnected: false,
  roomId: null,
  users: [],
  remoteStrokes: [],
  remoteLiveStrokes: [],
  remoteTextAnnotations: [],
  remoteWashiTapes: [],
  remoteStickyNotes: [],
  remoteImageElements: [],
  remoteTransforms: [],
  remoteViewports: [],
  remotePageSwitches: [],
  followingUserId: null,
  myColor: '#3b82f6',
  myName: 'Anonymous',
  myUserId: null,
  myRole: 'editor',
  isRoomCreator: false,
  chatMessages: [],
  unreadCount: 0,
  createRoom: async () => { throw new Error('Collaboration removed'); },
  joinExistingRoom: async () => { throw new Error('Collaboration removed'); },
  leave: noopAsync,
  sendCursor: noop,
  sendLiveStroke: noop,
  finishLiveStroke: noop,
  sendStroke: async () => null,
  undoMyLastStroke: noopAsync,
  deleteRemoteStrokes: noopAsync,
  getShareLink: () => null,
  sendTextAnnotation: noop,
  sendWashiTape: noop,
  sendStickyNote: noop,
  sendImageElement: noop,
  sendTransform: noop,
  finishTransform: noop,
  sendClearLayer: noop,
  sendViewport: noop,
  sendPageSwitch: noop,
  sendLayerEvent: noop,
  sendChatMessage: noop,
  markChatRead: noop,
  followUser: noop,
  changeUserRole: noopAsync,
});
