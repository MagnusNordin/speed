declare interface WakeLockSentinel {
  release: () => Promise<void>;
}

declare interface Navigator {
  wakeLock: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
}
