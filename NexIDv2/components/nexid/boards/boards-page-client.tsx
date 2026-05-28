"use client";

import { useEffect, useState } from "react";
import { fetchBoardsApi, renderCardApi } from "@/lib/services/nexid-client";
import type { BoardEntry, BoardKey } from "@/lib/types/nexid";
import { BoardList } from "@/components/nexid/shared/board-list";
import { boardLabels, emptyBoards } from "@/components/nexid/shared/utils";

export function BoardsPageClient() {
  const [board, setBoard] = useState<BoardKey>("faders");
  const [boards, setBoards] = useState<Record<BoardKey, BoardEntry[]>>(emptyBoards);
  const [message, setMessage] = useState("");
  const labels = boardLabels();
  const rows = boards[board] ?? [];
  const leader = rows[0] ?? null;

  useEffect(() => {
    void fetchBoardsApi().then(setBoards).catch(() => setBoards(emptyBoards));
  }, []);

  async function shareBoardCard() {
    try {
      if (!leader) {
        setMessage("This board has no qualifying live entries yet.");
        return;
      }
      const snapshotResponse = await fetch(`/api/boards/${encodeURIComponent(board)}/snapshot`, { method: "POST" });
      if (!snapshotResponse.ok) throw new Error("Could not prepare board card.");
      const card = await renderCardApi({ type: "board", title: `${labels[board]} board`, payload: { leader: leader.identity, rank: leader.rank, movement: leader.movement } });
      setMessage(`Board card rendered: ${card.publicUrl}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Card render failed.");
    }
  }

  return (
    <section id="boards" className="view active">
      <div className="edge-arena">
        <div className="arena-main"><div className="arena-content"><div className="eyebrow"><i className="dot" /> Legendary EdgeBoards</div><h2>Let the board judge.</h2><p>Rankings come from real positions, receipts and positive point balances.</p><button className="primary" onClick={shareBoardCard}>Share board card</button>{message ? <p>{message}</p> : null}</div></div>
        <aside className="elite-card"><span>Leader</span><b>{leader ? leader.identity : "No qualifying entries"}</b><p>{leader ? `${leader.thesis} - ${leader.movement}` : "The board stays empty until earned activity qualifies for a rank."}</p></aside>
      </div>
      <div className="tabs">{(Object.keys(labels) as BoardKey[]).map((key) => <button key={key} className={board === key ? "active" : ""} onClick={() => setBoard(key)}>{labels[key]}</button>)}</div>
      <BoardList rows={rows} />
    </section>
  );
}
