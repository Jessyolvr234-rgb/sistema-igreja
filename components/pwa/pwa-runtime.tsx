"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import styles from "./pwa.module.css";

function subscribeNetwork(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerOnlineSnapshot() {
  return true;
}

export default function PwaRuntime() {
  const online = useSyncExternalStore(
    subscribeNetwork,
    getOnlineSnapshot,
    getServerOnlineSnapshot
  );
  const [serviceWorkerError, setServiceWorkerError] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
        console.error("Não foi possível registrar o service worker:", error);
        setServiceWorkerError(true);
      });
    }
  }, []);

  if (online && !serviceWorkerError) return null;

  return (
    <div
      className={`${styles.runtimeNotice} ${
        serviceWorkerError ? styles.runtimeError : ""
      }`}
      role="status"
      aria-live="polite"
    >
      {serviceWorkerError
        ? "O suporte offline não pôde ser preparado neste navegador. O acesso online continua disponível."
        : "Você está sem conexão. As páginas e os dados da conta não são armazenados para acesso offline."}
    </div>
  );
}
