export type FlowAction = { type: 'next'; step: number } | { type: 'back' };

export function flowHistory(history: number[], action: FlowAction): number[] {
  if (action.type === 'back') return history.length > 1 ? history.slice(0, -1) : history;
  return history[history.length - 1] === action.step ? history : [...history, action.step];
}
