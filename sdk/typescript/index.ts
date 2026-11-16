export type MicroMailSlot =
  | 'search_bar_action'
  | 'compose_toolbar'
  | 'message_header_action'
  | 'sidebar_footer';

export interface SlotRendererContext {
  container: HTMLElement;
}

export interface SlotDefinition {
  render?: (container: HTMLElement) => void;
  label?: string;
  onClick?: () => void;
}

export interface MicroMailSDK<TConfig = Record<string, any>> {
  /** Unique identifier of this addon (e.g., 'official.voice-search') */
  addonId: string;

  /** User-configured settings saved in MicroMail for this addon */
  config: TConfig;

  /**
   * Resolves the absolute path to static assets within your addon's ui/ folder.
   * e.g., sdk.assetUrl("model.wasm") -> "/addons/<addon-id>/ui/model.wasm"
   */
  assetUrl: (relPath: string) => string;

  /**
   * Mount a visual control or button into a designated MicroMail UI slot.
   */
  registerSlot: (slot: MicroMailSlot | string, definition: SlotDefinition) => void;

  /**
   * Populate or trigger a search query in the inbox search bar.
   */
  setSearchQuery: (query: string) => void;

  /**
   * Insert template or transcribed text into the active email composer.
   */
  insertComposeText: (text: string) => void;
}

export interface MicroMailFrontendAddon<TConfig = Record<string, any>> {
  init(sdk: MicroMailSDK<TConfig>): void | Promise<void>;
}
