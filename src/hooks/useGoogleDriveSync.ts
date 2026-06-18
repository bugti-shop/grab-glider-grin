// Stub — Drive sync removed. Hook is a no-op.
export function useGoogleDriveSync() {
  return {
    triggerSync: async () => {},
    isSyncing: false,
  };
}
