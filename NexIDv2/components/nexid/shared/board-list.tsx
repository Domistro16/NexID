"use client";

import type { BoardEntry } from "@/lib/types/nexid";
import { EmptyState } from "@/components/nexid/shared/empty-state";

export function BoardList({ rows }: { rows: BoardEntry[] }) {
  if (!rows.length) {
    return <EmptyState title="Board is empty" copy="Positions, receipts and points will populate this board from live product data." />;
  }
  return (
    <div className="leaderboard">
      {rows.map((row) => (
        <div className="leader-row" key={row.id}>
          <b>{row.rank}</b>
          <div><strong>{row.identity}</strong><span>{row.thesis}</span></div>
          <em>{row.result}</em>
          <small>{row.points} - {row.movement}</small>
        </div>
      ))}
    </div>
  );
}
