import { createContext, useContext, useState, useCallback } from 'react';

/**
 * Contexto compartido para propagar cambios de reglas "Cliente Retira"
 * al calendario en tiempo real.
 *
 * Funciona cross-route: el provider vive en App.tsx y ambas páginas
 * (Clientes y Calendario) leen/escriben desde el mismo nodo de contexto.
 */

interface ClientPickupRulesContextValue {
  /** Unix timestamp de la última vez que se creó/editó/eliminó una regla */
  lastRuleChange: number;
  /** Dock IDs afectados por el último cambio */
  affectedDockIds: string[];
  /**
   * Señaliza que hubo un cambio en las reglas.
   * @param dockIds  Los andenes cuyos bloques deben recargarse en el calendario
   */
  notifyRuleChanged: (dockIds: string[]) => void;
}

const ClientPickupRulesContext = createContext<ClientPickupRulesContextValue>({
  lastRuleChange: 0,
  affectedDockIds: [],
  notifyRuleChanged: () => {},
});

export function ClientPickupRulesProvider({ children }: { children: React.ReactNode }) {
  const [lastRuleChange, setLastRuleChange] = useState<number>(0);
  const [affectedDockIds, setAffectedDockIds] = useState<string[]>([]);

  const notifyRuleChanged = useCallback((dockIds: string[]) => {
    setAffectedDockIds(dockIds);
    setLastRuleChange(Date.now());
  }, []);

  return (
    <ClientPickupRulesContext.Provider value={{ lastRuleChange, affectedDockIds, notifyRuleChanged }}>
      {children}
    </ClientPickupRulesContext.Provider>
  );
}

/**
 * Hook para consumir el contexto de reglas de Cliente Retira.
 * Disponible en cualquier componente dentro del árbol del provider.
 */
export function useClientPickupRulesContext(): ClientPickupRulesContextValue {
  return useContext(ClientPickupRulesContext);
}
