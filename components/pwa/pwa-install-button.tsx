"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import styles from "./pwa.module.css";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Props = {
  variant?: "default" | "home";
};

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function subscribeInstalled(callback: () => void) {
  const mediaQuery = window.matchMedia("(display-mode: standalone)");
  mediaQuery.addEventListener("change", callback);
  window.addEventListener("appinstalled", callback);
  return () => {
    mediaQuery.removeEventListener("change", callback);
    window.removeEventListener("appinstalled", callback);
  };
}

function getInstalledSnapshot() {
  return isInstalled();
}

function getServerInstalledSnapshot() {
  return false;
}

function getInstallInstructions() {
  const userAgent = navigator.userAgent;
  const isAppleMobile =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isAppleMobile) {
    return "No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.";
  }
  if (/Macintosh|Mac OS X/i.test(userAgent) && /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS/i.test(userAgent)) {
    return "No Safari do macOS, use o menu Arquivo e escolha “Adicionar ao Dock”.";
  }
  if (/Firefox/i.test(userAgent)) {
    return "A instalação não é oferecida pelo Firefox neste dispositivo. Abra este endereço no Safari (Apple) ou Chrome/Edge (Android, Windows ou macOS) e use a opção de instalação do navegador.";
  }
  return "Use o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.";
}

export default function PwaInstallButton({ variant = "default" }: Props) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [instructions, setInstructions] = useState("");
  const installed = useSyncExternalStore(
    subscribeInstalled,
    getInstalledSnapshot,
    getServerInstalledSnapshot
  );

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    }

    function handleInstalled() {
      setPromptEvent(null);
      setInstructions("");
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt as EventListener
    );
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt as EventListener
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed) return null;

  async function handleInstall() {
    if (!promptEvent) {
      setInstructions(getInstallInstructions());
      return;
    }

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        setInstructions("");
      }
      setPromptEvent(null);
    } catch (error) {
      console.error("Não foi possível abrir o convite de instalação:", error);
      setInstructions(
        "Não foi possível iniciar a instalação. Use o menu do navegador para adicionar o aplicativo."
      );
    }
  }

  return (
    <div>
      <button
        className={`${styles.installButton} ${
          variant === "home" ? styles.homeInstallButton : ""
        }`}
        onClick={handleInstall}
        type="button"
      >
        <svg
          aria-hidden="true"
          className={styles.installIcon}
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 3v12m0 0 4-4m-4 4-4-4M5 16v4h14v-4"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
        Instalar aplicativo
      </button>
      {instructions && (
        <div className={styles.installInstructions} role="status">
          <strong>Como instalar</strong>
          {instructions}
        </div>
      )}
    </div>
  );
}
