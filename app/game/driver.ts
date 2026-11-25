/**
 * What the UI can ask of the game. `mockDriver` plays a practice game with no chain;
 * `chainDriver` (Phase 5) plays the real one. Both write only to the store.
 */
export interface GameDriver {
  readonly kind: "mock" | "chain";
  /** Start timers/listeners. Idempotent. */
  init(): void;
  dispose(): void;

  // wallet
  /** A "Connect wallet" button was pressed: connect directly (practice) or open the wallet picker (chain). */
  requestConnect(): void;
  connectWallet(optionId?: string): Promise<void>;
  closeWalletSheet(): void;
  disconnectWallet(): void;
  fundForTesting(): Promise<void>;
  copyAddress(): Promise<void>;

  // starting a round
  /** The big "Insert credit" button: connects first if needed, then opens the credit sheet. */
  primaryAction(): void;
  openCredit(): void;
  closeCredit(): void;
  approveAndPlay(): Promise<void>;

  // during a round
  /** Joystick / keyboard vector in -1..1 on each axis. */
  setInput(x: number, z: number): void;
  /** Called every frame by the scene host while a round may be running. */
  tick(dt: number): void;
  drop(): Promise<void>;
  /** The scene finished its drop animation: begin the reveal. */
  onDropAnimationEnd(): void;

  // after a round
  openClaim(): void;
  approveClaim(): Promise<void>;
  keepPrize(): void;
  sellBackLast(): Promise<void>;
  sellBackFromShelf(creatureId: string): Promise<void>;
  /** Read the wallet's creatures from the chain again (after a failed read). */
  reloadShelf(): Promise<void>;
  closeReveal(): void;
  playAgain(): void;

  // attract mode
  enterArcade(): void;
  leaveArcade(): void;
}
