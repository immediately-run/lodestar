import { useContext } from 'react';
import { LodestarContext } from '../lib/context';
import type { LodestarApi } from '../lib/context';

/** Access the Lodestar controller from any descendant of `<Lodestar>`. */
export function useWb(): LodestarApi {
  const ctx = useContext(LodestarContext);
  if (!ctx) throw new Error('useWb must be used within <Lodestar>');
  return ctx;
}
