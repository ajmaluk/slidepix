import { useState, useRef, useCallback, useEffect } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";

interface UseSpeechToTextReturn {
  isListening: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  isSupported: boolean;
  error: string | null;
}

export function useSpeechToText(onResult?: (text: string) => void): UseSpeechToTextReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const shouldKeepListeningRef = useRef(false);
  const lastDeliveredFinalRef = useRef("");

  const {
    transcript: liveTranscript,
    finalTranscript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition();

  const isSupported = typeof window !== "undefined" && browserSupportsSpeechRecognition;

  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  const getStartOptions = useCallback(
    () => ({
      language: "en-US",
      continuous: !isIOS,
      interimResults: true,
    }),
    [isIOS]
  );

  const stopListening = useCallback(() => {
    shouldKeepListeningRef.current = false;
    SpeechRecognition.stopListening();
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    if (!isSupported) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    if (!isMicrophoneAvailable) {
      setError("Microphone access denied. Please enable permissions.");
      return;
    }

    setError(null);
    setTranscript("");
    lastDeliveredFinalRef.current = "";
    shouldKeepListeningRef.current = true;
    resetTranscript();

    try {
      await SpeechRecognition.startListening(getStartOptions());
      setIsListening(true);
    } catch (e) {
      console.error("Failed to start recognition:", e);
      setError("Could not start speech recognition.");
      shouldKeepListeningRef.current = false;
      setIsListening(false);
    }
  }, [getStartOptions, isMicrophoneAvailable, isSupported, resetTranscript]);

  useEffect(() => {
    setTranscript(liveTranscript);
  }, [liveTranscript]);

  useEffect(() => {
    setIsListening(listening);
  }, [listening]);

  useEffect(() => {
    const finalized = finalTranscript.trim();
    if (!finalized || finalized === lastDeliveredFinalRef.current) return;
    lastDeliveredFinalRef.current = finalized;
    onResult?.(finalized);
    resetTranscript();
    lastDeliveredFinalRef.current = "";
  }, [finalTranscript, onResult, resetTranscript]);

  // Silence detection: if liveTranscript has text but hasn't changed for 1.5s, finalize it
  useEffect(() => {
    if (!liveTranscript.trim()) return;
    
    const timeoutId = setTimeout(() => {
      const text = liveTranscript.trim();
      if (text && text !== lastDeliveredFinalRef.current) {
        lastDeliveredFinalRef.current = text;
        onResult?.(text);
        resetTranscript();
        lastDeliveredFinalRef.current = "";
      }
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [liveTranscript, onResult, resetTranscript]);

  // Mobile browsers often stop recognition between utterances; auto-resume while active.
  useEffect(() => {
    if (!shouldKeepListeningRef.current || listening || !isSupported) return;

    // We shouldn't auto-restart blindly on mobile because it requires user interaction or causes errors
    if (isIOS || /Android/i.test(navigator.userAgent)) {
      shouldKeepListeningRef.current = false;
      setIsListening(false);
      return;
    }

    const id = setTimeout(async () => {
      try {
        await SpeechRecognition.startListening(getStartOptions());
      } catch (e) {
        console.warn("Auto-restart speech recognition failed:", e);
        shouldKeepListeningRef.current = false;
        setIsListening(false);
        setError("Speech recognition stopped unexpectedly.");
      }
    }, 180);

    return () => clearTimeout(id);
  }, [getStartOptions, isSupported, listening, isIOS]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldKeepListeningRef.current = false;
      SpeechRecognition.abortListening();
    };
  }, []);

  useEffect(() => {
    if (!isSupported) {
      setError("Speech recognition is not supported in this browser.");
    }
  }, [isSupported]);

  return { isListening, transcript, startListening, stopListening, isSupported, error };
}
