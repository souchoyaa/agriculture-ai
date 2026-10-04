// Minimal stack navigation: tabs reset the stack; detail screens push onto it.
export type Route =
  | { name: 'fields' }
  | { name: 'field'; fieldId: string }
  | { name: 'check'; fieldId?: string }
  | { name: 'result'; recordId: string }
  | { name: 'history' }
  | { name: 'settings' };
export type TabName = 'fields' | 'check' | 'history' | 'settings';
export interface Nav {
  push(route: Route): void;
  replace(route: Route): void;
  back(): void;
  canGoBack: boolean;
}
