import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ScaleMode = "log" | "linear";

interface ScaleModeContextValue {
  scaleMode: ScaleMode;
  setScaleMode: (mode: ScaleMode) => void;
  broadcastVersion: number;
}

const ScaleModeContext = createContext<ScaleModeContextValue>({
  scaleMode: "log",
  setScaleMode: () => {},
  broadcastVersion: 0,
});

export function ScaleModeProvider({ children }: { children: ReactNode }) {
  const [scaleMode, setScaleModeRaw] = useState<ScaleMode>("log");
  const [broadcastVersion, setVersion] = useState(0);

  const setScaleMode = useCallback((mode: ScaleMode) => {
    setScaleModeRaw(mode);
    setVersion((v) => v + 1);
  }, []);

  return (
    <ScaleModeContext.Provider value={{ scaleMode, setScaleMode, broadcastVersion }}>
      {children}
    </ScaleModeContext.Provider>
  );
}

export function useScaleMode(): { scaleMode: ScaleMode; setScaleMode: (m: ScaleMode) => void } {
  const { scaleMode, setScaleMode } = useContext(ScaleModeContext);
  return { scaleMode, setScaleMode };
}

interface ChartScaleResult {
  scale: ScaleMode;
  domain: [number | string, number | string];
  isLog: boolean;
  setScale: (mode: ScaleMode) => void;
  toggle: () => void;
}

export function useChartScale(): ChartScaleResult {
  const { scaleMode: globalMode, broadcastVersion } = useContext(ScaleModeContext);
  const [localMode, setLocalMode] = useState<ScaleMode>(globalMode);

  useEffect(() => {
    setLocalMode(globalMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcastVersion]);

  return {
    scale: localMode,
    domain: (localMode === "log" ? [1, "auto"] : [0, "auto"]) as [number | string, number | string],
    isLog: localMode === "log",
    setScale: setLocalMode,
    toggle: () => setLocalMode(localMode === "log" ? "linear" : "log"),
  };
}
