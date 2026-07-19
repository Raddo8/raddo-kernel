import { useEffect, useRef, useState } from "react";

/**
 * Web Speech API voice-to-text hook. Graceful fallback: `supported=false`
 * on browsers without SpeechRecognition (Firefox, most mobile).
 * Emits final transcripts via onTranscript, one appended fragment at a time.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const cbRef = useRef(onTranscript);
  const recRef = useRef<any>(null);

  useEffect(() => { cbRef.current = onTranscript; }, [onTranscript]);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-US";
    r.onresult = (e: any) => {
      let out = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) out += e.results[i][0].transcript;
      }
      if (out) cbRef.current(out);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    return () => { try { r.stop(); } catch {} };
  }, []);

  const toggle = () => {
    const r = recRef.current;
    if (!r) return;
    if (listening) { try { r.stop(); } catch {} setListening(false); }
    else { try { r.start(); setListening(true); } catch {} }
  };

  return { supported, listening, toggle };
}
