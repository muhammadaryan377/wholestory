import type { Picked } from './api';
/** Passes chosen photos from one screen to the next without putting them in the address. */
let pending: { photos: Picked[]; title?: string; prompt?: string } | null = null;
export const handOff = (v: typeof pending) => { pending = v; };
export const takeHandOff = () => { const v = pending; pending = null; return v; };
