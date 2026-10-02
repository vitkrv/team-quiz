import { createContext, useContext } from 'react';

export const HoldGuidanceContext = createContext(null);

export const useHoldGuidance = () => useContext(HoldGuidanceContext);
