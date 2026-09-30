import { useState, useEffect, useCallback } from 'react';
import { TANK_STYLES, DEFAULT_TANK_STYLE } from './tankVariants/index.js';

const STORAGE_KEY = 'swampds_tank_style';

function readStored(key, validIds, fallback) {
  try {
    const saved = localStorage.getItem(key);
    if (saved && validIds.has(saved)) return saved;
  } catch { /* storage unavailable */ }
  return fallback;
}

function writeStored(key, id) {
  try { localStorage.setItem(key, id); } catch { /* ignore */ }
}

/**
 * The viewer's chosen tank animation style (source/delivery tanks on the pipeline
 * schematic), persisted across visits in this browser. The dashboard passes its own
 * key and style list (which adds its original "Classic" gauge).
 * @returns {[string, (id: string) => void]}
 */
export function useTankStyle(key = STORAGE_KEY, styles = TANK_STYLES, fallback = DEFAULT_TANK_STYLE) {
  const [validIds] = useState(() => new Set(styles.map((s) => s.id)));
  const [style, setStyle] = useState(() => readStored(key, validIds, fallback));

  useEffect(() => { writeStored(key, style); }, [key, style]);

  const choose = useCallback((id) => {
    if (validIds.has(id)) setStyle(id);
  }, [validIds]);

  return [style, choose];
}
