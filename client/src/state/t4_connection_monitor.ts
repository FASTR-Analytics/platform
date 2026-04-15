import { createSignal, onCleanup, onMount } from "solid-js";

// Signal to track online/offline status
const [isOnline, setIsOnline] = createSignal(navigator.onLine);
const [connectionIssues, setConnectionIssues] = createSignal(false);

// Track recent failed requests
let recentFailures = 0;
let failureResetTimer: number | undefined;

export function useConnectionMonitor() {
  onMount(() => {
    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      setConnectionIssues(false);
      recentFailures = 0;
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setConnectionIssues(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    onCleanup(() => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (failureResetTimer) {
        clearTimeout(failureResetTimer);
      }
    });
  });

  return {
    isOnline,
    connectionIssues,
  };
}

// Call this when a request fails due to network issues
export function reportNetworkFailure() {
  recentFailures++;
  
  // If we have multiple failures in a short time, flag connection issues
  if (recentFailures >= 2) {
    setConnectionIssues(true);
  }
  
  // Reset failure count after 30 seconds of no new failures
  if (failureResetTimer) {
    clearTimeout(failureResetTimer);
  }
  failureResetTimer = setTimeout(() => {
    recentFailures = 0;
    if (navigator.onLine) {
      setConnectionIssues(false);
    }
  }, 30000) as unknown as number;
}

// Call this when a request succeeds to clear connection issues
export function reportNetworkSuccess() {
  recentFailures = 0;
  if (navigator.onLine) {
    setConnectionIssues(false);
  }
}