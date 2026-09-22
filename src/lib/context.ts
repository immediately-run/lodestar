// React context carrying the single `useLodestar` instance to every chrome and
// canvas component, so they read state and call actions without prop-drilling.
// The provider is `<Lodestar>`; consumers use the `useWb` hook.

import { createContext } from 'react';
import type { useLodestar } from '../hooks/useLodestar';

export type LodestarApi = ReturnType<typeof useLodestar>;

export const LodestarContext = createContext<LodestarApi | null>(null);
