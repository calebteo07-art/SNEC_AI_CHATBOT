export type RewardKind = "achievement" | "streak-badge" | "lumen-badge" | "level-up";

export interface Reward {
  id: string;        // stable unique unlock id — dedupes the queue
  kind: RewardKind;
  title: string;
  subtitle: string;
  art: string;       // banner backdrop art path
  medal?: string;    // optional medallion overlay (badge unlocks)
  lumens?: number;   // optional Lumen amount to show
}
